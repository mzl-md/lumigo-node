import * as utils from '../utils';
import {
  LUMIGO_SECRET_MASKING_ALL_MAGIC,
  LUMIGO_SECRET_MASKING_REGEX,
  LUMIGO_SECRET_MASKING_REGEX_BACKWARD_COMP,
  LUMIGO_SECRET_MASKING_REGEX_HTTP_REQUEST_BODIES,
  LUMIGO_WHITELIST_KEYS_REGEXES,
} from '../utils';
import { keyToOmitRegexes, payloadStringify, shallowMask, truncate } from './payloadStringify';
import { ConsoleWritesForTesting } from '../../testUtils/consoleMocker';
import { TracerGlobals } from '../globals';

describe('payloadStringify', () => {
  test('payloadStringify -> simple flow -> object', () => {
    const payload = { a: 2, b: 3 };

    const result = payloadStringify(payload);

    expect(result).toEqual('{"a":2,"b":3}');
  });

  test('payloadStringify -> simple flow -> null', () => {
    const payload = null;

    const result = payloadStringify(payload);

    expect(result).toEqual('null');
  });

  test('payloadStringify -> simple flow -> complex object', () => {
    const payload = { a: [{ a: 2 }], b: 3 };

    const result = payloadStringify(payload);

    expect(result).toEqual('{"a":[{"a":2}],"b":3}');
  });

  test('payloadStringify -> simple flow -> list', () => {
    const payload = [2, 3];

    const result = payloadStringify(payload);

    expect(result).toEqual('[2,3]');
  });

  test('payloadStringify -> simple flow -> complex list', () => {
    const payload = [{ a: 2 }, 3];

    const result = payloadStringify(payload);

    expect(result).toEqual('[{"a":2},3]');
  });

  test('payloadStringify -> simple flow -> str', () => {
    const payload = 'STR';

    const result = payloadStringify(payload);

    expect(result).toEqual('"STR"');
  });

  test('payloadStringify -> simple flow -> number', () => {
    const payload = 2;

    const result = payloadStringify(payload);

    expect(result).toEqual('2');
  });

  test('payloadStringify -> simple flow -> undefined', () => {
    const payload = undefined;

    const result = payloadStringify(payload);

    expect(result).toEqual('');
  });

  test('payloadStringify -> truncate all', () => {
    const payload = { a: 2, b: 3 };

    const result = payloadStringify(payload, 0);

    expect(result).toEqual('');
  });

  test('payloadStringify -> truncate Circular JSON ', () => {
    utils.setDebug();
    utils.setStoreLogsOn();
    const payload = { b: 3 };
    payload.b = payload;
    const result = truncate(payload);
    expect(result).toEqual('');
  });

  test('payloadStringify -> secret masking', () => {
    const payload = { a: 2, password: 'CoolPass35' };

    const result = payloadStringify(payload);

    expect(result).toEqual('{"a":2,"password":"****"}');
  });

  test('payloadStringify -> truncate after 10B', () => {
    const payload = {
      a: 2,
      b: 3,
      c: 3,
      d: 4,
      e: 5,
      f: 6,
      g: 7,
      aa: 11,
      bb: 22,
      cc: 33,
      dd: 44,
      ee: 55,
      aaa: 111,
      bbb: 222,
      ccc: 333,
      ddd: 444,
      eee: 555,
    };

    const result = payloadStringify(payload, 10);

    expect(result).toEqual('{"a":2,"b":3,"c":3,"d":4,"e":5,"f":6,"g":7,"aa":11}...[too long]');
  });

  test('payloadStringify -> truncate after 10B -> list', () => {
    const payload = [2, 3, 3, 4, 5, 6, 7, 11, 22, 33, 44, 55, 111, 222, 333, 444, 555];

    const result = payloadStringify(payload, 10);

    expect(result).toEqual('[2,3,3,4,5,6,7,11]...[too long]');
  });

  test('truncate on non-string', () => {
    const payload = { an: 'object' };

    const result = truncate(payload, 10);

    expect(result).toEqual('');
  });

  test('truncate on undefined', () => {
    const result = truncate(undefined, 10);

    expect(result).toEqual('');
  });

  test('truncate on null', () => {
    const result = truncate(null, 10);

    expect(result).toEqual('');
  });

  test('payloadStringify -> Huge String', () => {
    const length = 100000;
    let payload = '';
    for (let i = 0; i < length; i++) {
      payload += 'x';
    }

    const result = payloadStringify(payload, 10);

    expect(result).toEqual('"xxxxxxxxxx"...[too long]');
    expect(result.length).toEqual(25);
  });

  test('payloadStringify -> circular object', () => {
    let a = {};
    const payload = { a };
    payload.a = a;

    const result = payloadStringify(payload, 10);

    expect(result).toEqual('{"a":{}}');
  });

  test('payloadStringify -> circular inside array', () => {
    const dummy = {};
    const circular = { dummy };
    dummy['circular'] = circular;

    const payload = { a: [circular, 2] };

    const result = payloadStringify(payload, 10);

    expect(result).toEqual('{"a":[{"dummy":{}},2]}...[too long]');
  });

  test('payloadStringify -> circular -> inherited property', function () {
    function Base() {
      this.base = true;
    }
    function Child() {
      this.child = true;
    }
    Child.prototype = new Base();

    const result = payloadStringify(new Child());

    expect(result).toEqual('{"child":true}');
  });

  test('payloadStringify -> exception', function () {
    const error = new Error('SomeRandomError');
    const result = payloadStringify(error);

    const resultAsObject = JSON.parse(result);
    expect(resultAsObject.message).toEqual('SomeRandomError');
    expect(resultAsObject.stack.length).toBeGreaterThan(0);
  });

  test('keyToOmitRegexes', () => {
    process.env[LUMIGO_SECRET_MASKING_REGEX] = ['[".*evilPlan.*"]'];
    expect(keyToOmitRegexes().map((p) => String(p))).toEqual(['/.*evilPlan.*/i']);
    process.env[LUMIGO_SECRET_MASKING_REGEX] = undefined;
    process.env[LUMIGO_SECRET_MASKING_REGEX_BACKWARD_COMP] = ['[".*evilPlan2.*"]'];
    expect(keyToOmitRegexes().map((p) => String(p))).toEqual(['/.*evilPlan2.*/i']);
    process.env[LUMIGO_SECRET_MASKING_REGEX_BACKWARD_COMP] = undefined;
  });

  test('payloadStringify -> skipScrubPath -> Not nested', () => {
    const payload = { Key: 'value' };
    const result = payloadStringify(payload, 1024, ['Key']);
    expect(result).toEqual(JSON.stringify(payload));
  });

  test('payloadStringify -> skipScrubPath -> Nested with array', () => {
    const payload = { Records: [{ object: { key: 'value' } }, { object: { key: 'value' } }] };
    const result = payloadStringify(payload, 1024, ['Records', [], 'object', 'key']);
    expect(result).toEqual(JSON.stringify(payload));
  });

  test('payloadStringify -> skipScrubPath -> Doesnt affect other paths', () => {
    const result = payloadStringify({ o: { key: 'value', password: 'value' } }, 1024, ['o', 'key']);
    expect(result).toEqual(JSON.stringify({ o: { key: 'value', password: '****' } }));
  });

  test('payloadStringify -> shoudnt scrub whitelist keys', () => {
    process.env[LUMIGO_WHITELIST_KEYS_REGEXES] =
      '[".*KeyConditionExpression.*", ".*ExclusiveStartKey.*"]';
    const result = payloadStringify(
      { ExclusiveStartKey: 'value', KeyConditionExpression: 'value' },
      1024
    );
    expect(result).toEqual(
      JSON.stringify({ ExclusiveStartKey: 'value', KeyConditionExpression: 'value' })
    );
    process.env[LUMIGO_WHITELIST_KEYS_REGEXES] = undefined;
  });

  test('payloadStringify -> skipScrubPath -> Nested items arent affected', () => {
    const result = payloadStringify({ o: { key: { password: 'value' } } }, 1024, ['o', 'key']);
    expect(result).toEqual(JSON.stringify({ o: { key: { password: '****' } } }));
  });

  test('payloadStringify -> skipScrubPath -> Affect only the full path', () => {
    const result = payloadStringify({ a: { key: 'c' } }, 1024, ['key']);
    expect(result).toEqual(JSON.stringify({ a: { key: '****' } }));
  });

  test('payloadStringify -> skipScrubPath -> Path doesnt exist', () => {
    const result = payloadStringify({ a: { key: 'c' } }, 1024, ['b', 'key']);
    expect(result).toEqual(JSON.stringify({ a: { key: '****' } }));
  });

  test('payloadStringify -> skipScrubPath -> Catch exception', () => {
    const skipPathWithError = ['a', 'key'];
    skipPathWithError.slice = () => {
      throw Error('ERROR');
    };
    const result = payloadStringify({ a: { key: 'c' } }, 1024, skipPathWithError);
    expect(result).toEqual(JSON.stringify({ a: { key: '****' } }));
  });

  test('payloadStringify -> skipScrubPath empty array -> Do nothing', () => {
    const result = payloadStringify({ a: { key: 'c' } }, 1024, []);
    expect(result).toEqual(JSON.stringify({ a: { key: '****' } }));
  });

  test('shallowMask -> requestBody -> all', () => {
    process.env[LUMIGO_SECRET_MASKING_REGEX_HTTP_REQUEST_BODIES] = LUMIGO_SECRET_MASKING_ALL_MAGIC;
    expect(shallowMask('requestBody', 'body')).toEqual('****');
    expect(shallowMask('requestBody', { a: 'b' })).toEqual('****');
  });

  test('shallowMask -> requestBody -> regex', () => {
    process.env[LUMIGO_SECRET_MASKING_REGEX_HTTP_REQUEST_BODIES] = '[".*X.*"]';
    expect(shallowMask('requestBody', { a: 'b', aXy: 'bla' })).toEqual({ a: 'b', aXy: '****' });
  });

  test('shallowMask -> requestBody -> fallback', () => {
    expect(shallowMask('requestBody', { a: 'b', password: 'bla' })).toEqual({
      a: 'b',
      password: '****',
    });
  });

  test('shallowMask -> string input -> Do nothing', () => {
    expect(shallowMask('requestBody', 'body')).toEqual('body');
  });

  test('shallowMask -> non object input -> Do nothing and warn', () => {
    utils.setDebug();
    TracerGlobals.setTracerInputs({});
    expect(shallowMask('requestBody', 1)).toEqual(1);
    expect(ConsoleWritesForTesting.getLogs()).toEqual([
      {
        msg: '#LUMIGO# - WARNING - "Failed to mask payload, payload is not an object or string"',
        obj: '1',
      },
    ]);
  });

  test('shallowMask -> unknown context -> use default and warn', () => {
    utils.setDebug();
    TracerGlobals.setTracerInputs({});
    expect(shallowMask('other', { a: 'b', password: 1234 })).toEqual({ a: 'b', password: '****' });
    expect(ConsoleWritesForTesting.getLogs()).toEqual([
      {
        msg: '#LUMIGO# - WARNING - "Unknown context for shallowMask"',
        obj: '"other"',
      },
    ]);
  });
});
