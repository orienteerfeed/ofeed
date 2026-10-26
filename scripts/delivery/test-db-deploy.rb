#!/usr/bin/env ruby
require 'minitest/autorun'
require 'tmpdir'
require 'fileutils'
require 'open3'

class DatabaseDeploymentTest < Minitest::Test
  SCRIPT = File.expand_path('../../apps/server/docker-db-deploy.sh', __dir__)

  def run_deployment(migration_exit: 0, seed_exit: 0)
    Dir.mktmpdir('ofeed-db-deploy-') do |directory|
      bin = File.join(directory, 'node_modules', '.bin')
      FileUtils.mkdir_p(bin)
      %w[prisma tsx].each do |name|
        path = File.join(bin, name)
        result = name == 'prisma' ? migration_exit : seed_exit
        File.write(path, "#!/bin/sh\nprintf '%s\\n' \"#{name} $*\" >> \"$DEPLOY_FIXTURE_LOG\"\nexit #{result}\n")
        FileUtils.chmod(0755, path)
      end
      log = File.join(directory, 'calls')
      out, err, status = Open3.capture3({ 'DEPLOY_FIXTURE_LOG' => log }, 'sh', SCRIPT, chdir: directory)
      [File.read(log).lines.map(&:chomp), status.exitstatus, out, err]
    end
  end

  def test_migrates_before_seeding_reference_data
    calls, exit_status, _, err = run_deployment
    assert_equal 0, exit_status, err
    assert_equal ['prisma migrate deploy', 'tsx prisma/seed-reference-data.ts'], calls
  end

  def test_failed_migrations_prevent_seeding
    calls, exit_status = run_deployment(migration_exit: 17)
    assert_equal 17, exit_status
    assert_equal ['prisma migrate deploy'], calls
  end

  def test_failed_seed_fails_the_job
    calls, exit_status = run_deployment(seed_exit: 23)
    assert_equal 23, exit_status
    assert_equal ['prisma migrate deploy', 'tsx prisma/seed-reference-data.ts'], calls
  end
end
