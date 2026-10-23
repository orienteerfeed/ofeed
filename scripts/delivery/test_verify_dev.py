import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('verify_dev', Path(__file__).with_name('verify-dev.py'))
verify_dev = importlib.util.module_from_spec(spec)
spec.loader.exec_module(verify_dev)


class DeploymentStatusTest(unittest.TestCase):
    def application(self):
        return {
            'status': {
                'sync': {'status': 'Synced', 'revisions': ['a' * 40, 'a' * 40]},
                'health': {'status': 'Healthy'},
                'operationState': {'phase': 'Succeeded'},
            },
        }

    def test_exact_successful_revision(self):
        self.assertTrue(verify_dev.deployed(self.application(), 'a' * 40))

    def test_previous_healthy_revision_does_not_pass(self):
        self.assertFalse(verify_dev.deployed(self.application(), 'b' * 40))

    def test_mixed_source_revisions_do_not_pass(self):
        application = self.application()
        application['status']['sync']['revisions'][1] = 'b' * 40
        self.assertFalse(verify_dev.deployed(application, 'a' * 40))

    def test_failed_sync_does_not_pass_even_if_old_pods_are_healthy(self):
        application = self.application()
        application['status']['operationState']['phase'] = 'Failed'
        self.assertFalse(verify_dev.deployed(application, 'a' * 40))


if __name__ == '__main__':
    unittest.main()
