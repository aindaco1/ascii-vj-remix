import assert from 'node:assert/strict';
import {
  MIDI_PAGE_NAMES,
  MidiMappingEngine,
  UC33E_MIOXC_BINDINGS,
  coalesceMidiEvents,
  findPreferredMidiPort,
  mapMidiValue,
  sanitizeMidiBinding
} from '../renderers/shared/midi-mapping.js';

assert.equal(MIDI_PAGE_NAMES[1], 'Visual');
assert.equal(MIDI_PAGE_NAMES[3], 'Presets');
assert.equal(UC33E_MIOXC_BINDINGS.length, 47 * 4, 'all 47 controls should be mapped on all four pages');
assert.equal(new Set(UC33E_MIOXC_BINDINGS.map((binding) => `${binding.channel}:${binding.number}`)).size, 47 * 4);
assert.equal(
  UC33E_MIOXC_BINDINGS.some((binding) => /source|camera|popout|output/i.test(binding.target)),
  false,
  'the UC-33e profile must not control sources, cameras, or Pop Out'
);
for (let value = 0; value <= 9; value++) {
  const binding = UC33E_MIOXC_BINDINGS.find((candidate) =>
    candidate.channel === 3 && candidate.number === 34 + value
  );
  assert.equal(binding?.target, 'action.preset.digit');
  assert.equal(binding?.digit, value);
}
assert.equal(UC33E_MIOXC_BINDINGS.find((binding) => binding.channel === 3 && binding.number === 44)?.target, 'action.preset.clear');
assert.equal(UC33E_MIOXC_BINDINGS.find((binding) => binding.channel === 3 && binding.number === 45)?.target, 'action.preset.enter');
assert.equal(UC33E_MIOXC_BINDINGS.find((binding) => binding.channel === 3 && binding.number === 46)?.target, 'action.preset.previous');
assert.equal(UC33E_MIOXC_BINDINGS.find((binding) => binding.channel === 3 && binding.number === 47)?.target, 'action.preset.next');

assert.equal(mapMidiValue(0, {}, { type: 'range', min: 80, max: 900, step: 1 }), 80);
assert.equal(mapMidiValue(127, {}, { type: 'range', min: 80, max: 900, step: 1 }), 900);
assert.equal(mapMidiValue(127, { invert: true }, { type: 'range', min: 0, max: 1, step: 0.01 }), 0);
assert.equal(mapMidiValue(127, {}, { type: 'enum', options: ['a', 'b', 'c'] }), 'c');

const applied = [];
let targetValue = 0.75;
const engine = new MidiMappingEngine({
  bindings: [{ channel: 1, kind: 'cc', number: 2, target: 'visual.brightness', mode: 'continuous' }],
  getTarget: () => ({ type: 'range', min: 0, max: 1, step: 0.01, value: targetValue }),
  applyTarget: (_target, payload) => {
    applied.push(payload.value);
    targetValue = payload.value;
  }
});
assert.equal(engine.process({ kind: 'cc', channel: 1, number: 2, value: 5 })[0].waiting, true);
assert.equal(engine.process({ kind: 'cc', channel: 1, number: 2, value: 96 })[0].waiting, false);
assert.ok(applied.length === 1, 'pickup should apply only after crossing the software value');
engine.rearmPickup();
assert.equal(engine.process({ kind: 'cc', channel: 1, number: 2, value: 5 })[0].waiting, true);

const actions = [];
const actionEngine = new MidiMappingEngine({
  softTakeover: false,
  bindings: [{ channel: 3, kind: 'cc', number: 45, target: 'action.preset.digit', mode: 'action', digit: 7 }],
  applyTarget: (target, payload) => actions.push([target, payload.binding.digit])
});
assert.equal(actionEngine.process({ kind: 'cc', channel: 3, number: 45, value: 0 }).length, 0);
actionEngine.process({ kind: 'cc', channel: 3, number: 45, value: 127 });
assert.deepEqual(actions, [['action.preset.digit', 7]]);
actionEngine.process({ kind: 'cc', channel: 3, number: 45, value: 127 });
assert.equal(actions.length, 1, 'a held or repeated high value must not retrigger an action');
actionEngine.process({ kind: 'cc', channel: 3, number: 45, value: 0 });
actionEngine.process({ kind: 'cc', channel: 3, number: 45, value: 127 });
assert.equal(actions.length, 2, 'a release followed by a press must retrigger an action');

const noteActions = [];
const noteActionEngine = new MidiMappingEngine({
  softTakeover: false,
  bindings: [{ channel: 1, kind: 'noteOn', number: 64, target: 'action.audio.toggle', mode: 'action' }],
  applyTarget: (target) => noteActions.push(target)
});
noteActionEngine.process({ kind: 'noteOn', channel: 1, number: 64, value: 100 });
noteActionEngine.process({ kind: 'noteOff', channel: 1, number: 64, value: 0 });
noteActionEngine.process({ kind: 'noteOn', channel: 1, number: 64, value: 100 });
assert.equal(noteActions.length, 2, 'note-off must release a learned note action');

const coalesced = coalesceMidiEvents([
  { kind: 'cc', channel: 1, number: 2, value: 4 },
  { kind: 'cc', channel: 1, number: 2, value: 9 },
  { kind: 'cc', channel: 1, number: 34, value: 127 },
  { kind: 'cc', channel: 1, number: 34, value: 0 }
]);
assert.equal(coalesced.length, 3);
assert.equal(coalesced.at(-1).value, 9);

assert.equal(findPreferredMidiPort([{ name: 'Network' }, { name: 'mioXC MIDI In' }])?.name, 'mioXC MIDI In');
assert.equal(sanitizeMidiBinding({ channel: 99, number: -4, target: 'visual.gamma' }).channel, 16);

console.log('MIDI mapping checks passed.');
