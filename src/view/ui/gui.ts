// A machine's GUI: its figure (or plain panel) in an overlay over the floor, like opening a machine in Minecraft. A
// machine that runs recipes has an "available for autocrafting" switch under its title, for figure and panel alike:
// crafting jobs may borrow it when it is idle.
import { MACHINES, recipesForMachine } from '../../sim/data';
import { jobOf, stepName } from '../../sim/jobs';
import type { MachineState, World } from '../../sim/world';
import { mountFigureHost } from '../figure/host';
import { mountMachinePanel } from './machinePanel';

export interface MachineGui { machine: MachineState; sync(): void; close(): void }

export function openMachineGui(m: MachineState, getWorld: () => World, onChange: () => void, onClose: () => void, yaw = 45): MachineGui {
  const def = MACHINES.get(m.def)!;
  const back = document.createElement('div');
  back.className = 'gui-backdrop';
  back.innerHTML = `<div class="gui" role="dialog" aria-label="${def.name}">
      <header><h2>${def.name} <span class="muted">(${m.x}, ${m.y})</span></h2><button class="close" aria-label="Close">Close</button></header>
      ${recipesForMachine(def).length ? `<div class="gui-auto"><label><input type="checkbox"> Available for autocrafting</label><small class="muted"></small></div>` : ''}
      <div class="gui-body"></div>
    </div>`;
  document.body.appendChild(back);
  const body = back.querySelector<HTMLElement>('.gui-body')!;
  const inner = def.figure ? mountFigureHost(body, getWorld, m, onChange, yaw) : mountMachinePanel(body, getWorld, m, onChange);
  const auto = back.querySelector<HTMLInputElement>('.gui-auto input'), note = back.querySelector<HTMLElement>('.gui-auto small');
  if (auto) auto.onchange = () => { m.autocraft = auto.checked; onChange(); };
  const view = {
    destroy: inner.destroy,
    sync() {
      inner.sync();
      if (!auto || !note) return;
      auto.checked = m.autocraft;
      const lent = jobOf(getWorld(), m);
      note.textContent = lent && m.job ? `Lent to a crafting job for ${stepName(lent.step)}: ${m.job.done} of ${m.job.runs} run${m.job.runs === 1 ? '' : 's'} done, then it is handed back as you left it.`
        : m.autocraft ? 'Crafting jobs may borrow it when it is idle, and hand it back as you left it.' : 'Only you run it: crafting jobs leave it alone.';
    },
  };
  view.sync();

  const close = () => {
    view.destroy();
    back.remove();
    removeEventListener('keydown', onKey);
    onClose();
  };
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
  addEventListener('keydown', onKey);
  back.addEventListener('pointerdown', (e) => { if (e.target === back) close(); });
  back.querySelector<HTMLButtonElement>('.close')!.onclick = close;
  return { machine: m, sync: view.sync, close };
}
