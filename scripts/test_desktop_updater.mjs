import assert from 'node:assert/strict';
import {
  DEFAULT_CHECK_TIMEOUT_MS,
  DEFAULT_INSTALL_TIMEOUT_MS,
  DesktopUpdateController
} from '../renderers/desktop/update-controller.js';

const quietLogger = { warn() {} };

{
  let checks = 0;
  const states = [];
  const controller = new DesktopUpdateController({
    checkForUpdate: async (options) => {
      checks += 1;
      assert.equal(options.timeout, DEFAULT_CHECK_TIMEOUT_MS);
      return null;
    },
    installUpdate: async () => assert.fail('launch checks must not install updates'),
    onStateChange: (state) => states.push(state),
    logger: quietLogger
  });

  assert.equal(await controller.checkOnLaunch(), false);
  controller.setAvailable(true);
  assert.equal(await controller.checkOnLaunch(), true);
  assert.equal(await controller.checkOnLaunch(), false);
  assert.equal(checks, 1);
  assert.equal(controller.snapshot().status, '');
  assert.equal(states.some(({ status }) => status === 'Checking...' || status === 'Up to date'), false);
  assert.equal(states.some(({ busy, silent }) => busy && silent), true);
}

{
  const availableUpdate = { version: '0.9.8' };
  let checks = 0;
  let installs = 0;
  const controller = new DesktopUpdateController({
    checkForUpdate: async () => {
      checks += 1;
      return checks === 1 ? availableUpdate : null;
    },
    installUpdate: async (update, onEvent, options) => {
      installs += 1;
      assert.equal(update, availableUpdate);
      assert.equal(options.timeout, DEFAULT_INSTALL_TIMEOUT_MS);
      onEvent({ event: 'Started', data: { contentLength: 100 } });
      onEvent({ event: 'Progress', data: { chunkLength: 25 } });
      onEvent({ event: 'Finished' });
    },
    logger: quietLogger
  });

  controller.setAvailable(true);
  await controller.checkOnLaunch();
  assert.equal(controller.snapshot().status, 'v0.9.8 available');
  assert.equal(installs, 0);
  await controller.activate();
  assert.equal(installs, 1);
  assert.equal(controller.snapshot().status, 'Relaunching...');
}

{
  let attempts = 0;
  const controller = new DesktopUpdateController({
    checkForUpdate: async () => {
      attempts += 1;
      throw new Error('offline');
    },
    installUpdate: async () => assert.fail('a failed check cannot install'),
    logger: quietLogger
  });

  controller.setAvailable(true);
  assert.equal(await controller.checkOnLaunch(), false);
  assert.equal(controller.snapshot().status, '');
  assert.equal(await controller.activate(), false);
  assert.equal(attempts, 2);
  assert.equal(controller.snapshot().status, 'Check failed');
}

{
  let checks = 0;
  const controller = new DesktopUpdateController({
    checkForUpdate: async () => {
      checks += 1;
      return null;
    },
    installUpdate: async () => assert.fail('no update should not install'),
    logger: quietLogger
  });

  controller.setAvailable(true);
  await controller.checkOnLaunch();
  await controller.activate();
  assert.equal(checks, 2);
  assert.equal(controller.snapshot().status, 'Up to date');
}

console.log('Desktop updater launch and manual-flow tests passed.');
