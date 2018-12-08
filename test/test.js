const test = require('ava');

const Script = require('..');
const { beforeEach, afterEach } = require('./helpers');

test.beforeEach(beforeEach);
test.afterEach(afterEach);

test('returns itself', t => {
  t.true(t.context.script instanceof Script);
});
