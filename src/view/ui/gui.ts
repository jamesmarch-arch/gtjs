// A machine's GUI: its figure (or plain panel) in an overlay over the floor, like opening a machine in Minecraft.
import { MACHINES } from '../../sim/data';
import type { MachineState, World } from '../../sim/world';
import { mountFigureHost } from '../figure/host';
import { mountMachinePanel } from './machinePanel';

export interface MachineGui { machine: MachineState; sync(): void; close(): void }

export function openMachineGui(m: MachineState, getWorld: () => World, onChange: () => void, onClose: () => void): MachineGui {
  const def = MACHINES.get(m.def)!;
  const back = document.createElement('div');
  back.className = 'gui-backdrop';
  back.innerHTML = `<div class="gui" role="dialog" aria-label="${def.name}">
      <header><h2>${def.name} <span class="muted">(${m.x}, ${m.y})</span></h2><button class="close" aria-label="Close">Close</button></header>
      <div class="gui-body"></div>
    </div>`;
  document.body.appendChild(back);
  const body = back.querySelector<HTMLElement>('.gui-body')!;
  const view = (def.figure ? mountFigureHost : mountMachinePanel)(body, getWorld, m, onChange);

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
