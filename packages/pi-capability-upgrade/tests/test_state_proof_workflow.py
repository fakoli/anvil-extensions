import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('proof_workflow', Path(__file__).resolve().parents[1] / 'scripts/state-proof-workflow.py')
w = importlib.util.module_from_spec(spec)
spec.loader.exec_module(w)


class WorkflowTests(unittest.TestCase):
    def test_argv_preserves_spaces_and_refuses_different_gate(self):
        state = {'task': {'verification': {'required_proofs': [
            {'kind': 'command', 'command': 'python "check file.py"', 'passing_exit_codes': [0]}]}}}
        self.assertEqual(w.approved_commands({'gates': [{'argv': ['python', 'check file.py']}]}, state)[0][0], 'python "check file.py"')
        with self.assertRaises(ValueError):
            w.approved_commands({'gates': [{'argv': ['true']}]}, state)
        with self.assertRaises(ValueError):
            w.approved_commands({'gates': [{'argv': ['python', 'check file.py'], 'timeout_seconds': True}]}, state)

    def test_bounded_process_and_failure(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.assertEqual(w.run([sys.executable, '-c', 'print("ok")'], root), b'ok\n')
            with self.assertRaisesRegex(RuntimeError, 'exit 2'):
                w.run([sys.executable, '-c', 'raise SystemExit(2)'], root)
            with self.assertRaisesRegex(RuntimeError, 'output exceeded'):
                w.run([sys.executable, '-c', 'print("x"*200000)'], root)
            with self.assertRaisesRegex(RuntimeError, 'deadline'):
                w.run([sys.executable, '-c', 'import time;time.sleep(30)'], root, timeout=.1)

    def test_content_modes_untracked_and_index_preserved(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            def git(*args): return subprocess.check_output(['git', *args], cwd=root, stderr=subprocess.DEVNULL)
            git('init', '-q');git('config', 'user.name', 'Fixture');git('config', 'user.email', 'fixture@example.test')
            file = root / 'one';file.write_text('initial\n');git('add', '.');git('commit', '-qm', 'fixture')
            index_before = (root / '.git/index').read_bytes()
            initial = w.content_identity(root)
            file.write_text('outside edit\n');self.assertNotEqual(initial, w.content_identity(root))
            file.write_text('initial\n');self.assertEqual(initial, w.content_identity(root))
            file.chmod(0o755);self.assertNotEqual(initial, w.content_identity(root));file.chmod(0o644)
            (root / 'untracked').write_text('x');self.assertNotEqual(initial, w.content_identity(root))
            self.assertEqual(index_before, (root / '.git/index').read_bytes())

    def test_bounded_policy_manifest_and_proof_reads(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp)/'oversized'
            for maximum in [w.MAX_POLICY, w.MAX_MANIFEST, w.MAX_PROOF]:
                path.write_bytes(b'x'*(maximum+1))
                with self.assertRaisesRegex(ValueError,'size limit'):w.read_limited(path, maximum)

    def test_gate_environment_does_not_export_parent_secrets(self):
        with tempfile.TemporaryDirectory() as tmp, patch.dict(os.environ, {'SYNTHETIC_API_TOKEN':'private-fixture-value'}):
            value=w.run([sys.executable,'-c','import os;print(os.environ.get("SYNTHETIC_API_TOKEN", "absent"))'],Path(tmp),env=w.gate_environment())
            self.assertEqual(value,b'absent\n')

    def test_external_policy_is_required(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp).resolve()
            with self.assertRaises(ValueError): w.outside(root, root / 'policy.json')

    def test_submit_refuses_external_edit_policy_and_artifact_drift(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp).resolve(); policy = {'gates': [{'argv': ['true']}]}; raw = w.canonical(policy)
            state = {'task': {'verification': {'required_proofs': [{'kind':'command','command':'true','passing_exit_codes':[0]}]}}}
            artifact = root / 'proof.json';artifact.write_text('evidence')
            args = type('Args', (), dict(actor='fixture',task='T001',anvil='anvil',state_layout='local',output_dir=root))()
            manifest = dict(version='pi-state-command-evidence/v1',policy_sha256=w.digest(raw),root=str(root),actor='fixture',task_id='T001',head='head',content='content',state=state,commands=['true'],files=['one'],artifacts=[{'file':'proof.json','sha256':w.digest(artifact.read_bytes())}])
            with patch.object(w,'git',return_value='head'),patch.object(w,'content_identity',return_value='content') as identity,patch.object(w,'snapshot',return_value=state),patch.object(w,'changed_paths',return_value=['one']):
                w.verify_current(manifest,args,root,raw)
                identity.return_value='changed'
                with self.assertRaisesRegex(RuntimeError,'content changed'):w.verify_current(manifest,args,root,raw)
                identity.return_value='content'
                with self.assertRaisesRegex(RuntimeError,'policy changed'):w.verify_current(manifest,args,root,b'changed')
                artifact.write_text('tampered')
                with self.assertRaisesRegex(RuntimeError,'evidence changed'):w.verify_current(manifest,args,root,raw)


if __name__ == '__main__': unittest.main()
