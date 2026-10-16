import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { Button } from '~/components/ui/button';
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from '~/components/ui/dialog';
import { api } from '~/lib/api';

export function TriggerRunDialog({ workflowId, preset }: { workflowId?: string; preset?: string }) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState('');
  const [inputs, setInputs] = useState('{}');
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const target = preset ?? workflowId ?? picked;
  const needsPick = !preset && !workflowId;
  const workflows = useQuery({
    queryKey: ['workflows'],
    queryFn: api.listWorkflows,
    enabled: open && needsPick,
  });

  const create = useMutation({
    mutationFn: () => {
      if (!target) {
        throw new Error('Select a workflow first');
      }
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(inputs);
      } catch (e) {
        throw new Error(`Invalid JSON: ${(e as Error).message}`);
      }
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('Inputs must be a JSON object');
      }
      return api.createRun(target, parsed);
    },
    onSuccess: (run) => {
      setOpen(false);
      setInputs('{}');
      setError('');
      queryClient.invalidateQueries({ queryKey: ['runs'] });
      navigate({ to: '/workflows/$workflowId', params: { workflowId: run.workflow_id }, search: { run: run.id } });
    },
    onError: (e) => setError((e as Error).message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button>Trigger run</Button>} />
      <DialogContent aria-label="Trigger run">
        <DialogTitle>Trigger run{target ? ` on ${target}` : ''}</DialogTitle>
        {needsPick && (
          <label className="grid gap-1 text-sm">
            <span className="mu">Workflow</span>
            <select
              aria-label="Workflow"
              value={picked}
              onChange={(e) => setPicked(e.target.value)}
              className="input"
            >
              <option value="">Select a workflow…</option>
              {(workflows.data ?? []).map((w) => (
                <option key={w.id} value={w.id}>
                  {w.id}
                </option>
              ))}
            </select>
          </label>
        )}
        <p className="mu" style={{ margin: '8px 0 4px' }}>
          Inputs (JSON object)
        </p>
        <textarea
          aria-label="Run inputs (JSON)"
          value={inputs}
          onChange={(e) => setInputs(e.target.value)}
          rows={6}
          spellCheck={false}
          className="input"
        />
        <div aria-live="polite" className="err">
          {error}
        </div>
        <div className="row" style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 10 }}>
          <Button variant="secondary" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={() => create.mutate()} disabled={create.isPending}>
            {create.isPending ? 'Creating…' : 'Create run'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
