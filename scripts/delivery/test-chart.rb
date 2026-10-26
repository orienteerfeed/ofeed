#!/usr/bin/env ruby
require 'minitest/autorun'
require 'yaml'
require 'tempfile'
require 'open3'

class DeploymentChartTest < Minitest::Test
  CHART = File.expand_path('../../deploy/helm/ofeed', __dir__)
  COMPONENTS = %w[api web board ops].freeze

  def render(values)
    Tempfile.create(['ofeed-chart-test', '.yaml']) do |file|
      file.write(YAML.dump(values))
      file.flush
      out, err, status = Open3.capture3('helm', 'template', 'ofeed-dev', CHART, '-f', file.path)
      return [out, err, status]
    end
  end

  def tagged
    COMPONENTS.to_h { |component| [component, { 'image' => { 'tag' => 'test-fixture' } }] }
  end

  def test_tagged_deployments_keep_presync_default
    out, err, status = render(tagged)
    assert status.success?, err
    job = YAML.load_stream(out).compact.find { |resource| resource['kind'] == 'Job' }
    assert_equal 'PreSync', job.dig('metadata', 'annotations', 'argocd.argoproj.io/hook')
    refute job.fetch('spec').key?('ttlSecondsAfterFinished')
  end

  def test_required_digests_reject_tag_only_workloads
    _, err, status = render(tagged.merge('requireImageDigests' => true))
    refute status.success?
    assert_match(/image.digest is required/, err)
  end

  def test_digest_deployment_exposes_api_and_orders_migrations
    values = tagged.merge(
      'fullnameOverride' => 'ofeed-dev',
      'requireImageDigests' => true,
      'migrations' => { 'hook' => 'Sync', 'syncWave' => -10 },
      'serviceAccount' => { 'annotations' => { 'argocd.argoproj.io/sync-wave' => '-20' } }
    )
    COMPONENTS.each { |component| values[component]['image']['digest'] = "sha256:#{'1' * 64}" }
    values['api']['ingress'] = {
      'enabled' => true,
      'hosts' => [{ 'host' => 'api.dev.ofeed.live', 'paths' => [{ 'path' => '/', 'pathType' => 'Prefix' }] }]
    }
    out, err, status = render(values)
    assert status.success?, err
    resources = YAML.load_stream(out).compact
    workloads = resources.select { |resource| %w[Deployment Job].include?(resource['kind']) }
    assert_equal 4, workloads.length
    workloads.each do |resource|
      resource.dig('spec', 'template', 'spec', 'containers').each do |container|
        assert_match(/@sha256:[a-f0-9]{64}\z/, container.fetch('image'))
      end
    end
    ingress = resources.find { |resource| resource['kind'] == 'Ingress' && resource.dig('metadata', 'name') == 'ofeed-dev-api' }
    assert_equal 'api', ingress.dig('spec', 'rules', 0, 'http', 'paths', 0, 'backend', 'service', 'name')
    job = resources.find { |resource| resource['kind'] == 'Job' }
    assert_equal 'Sync', job.dig('metadata', 'annotations', 'argocd.argoproj.io/hook')
    assert_equal '-10', job.dig('metadata', 'annotations', 'argocd.argoproj.io/sync-wave')
    account = resources.find { |resource| resource['kind'] == 'ServiceAccount' }
    assert_equal '-20', account.dig('metadata', 'annotations', 'argocd.argoproj.io/sync-wave')
  end

  def test_invalid_digest_is_rejected
    values = tagged
    values['api']['image']['digest'] = 'sha256:invalid'
    _, err, status = render(values)
    refute status.success?
    assert_match(/api.image.digest must be/, err)
  end

  def test_invalid_migration_phase_is_rejected
    _, err, status = render(tagged.merge('migrations' => { 'hook' => 'PostSync' }))
    refute status.success?
    assert_match(/migrations.hook must be/, err)
  end
end
