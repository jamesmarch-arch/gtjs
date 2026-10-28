import { describe, expect, it } from 'vitest';
import { ITEMS } from '../../sim/data';
import { hasIcon, icon } from './icons';

describe('item icons', () => {
  it('give every item an icon: a drawing of its own, or its machine sprite', () => {
    expect([...ITEMS.keys()].filter((id) => !hasIcon(id))).toEqual([]);
  });

  it('show an icon by reference to its symbol', () => {
    expect(icon('iron_ingot')).toBe('<svg class="ic" viewBox="0 0 32 32" aria-hidden="true"><use href="#ic-iron_ingot"/></svg>');
    expect(icon('no_such_thing')).toBe('');
  });
});
