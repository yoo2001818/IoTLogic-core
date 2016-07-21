import { NativeProcedureValue, PairValue, SymbolValue, StringValue,
  BooleanValue, assert } from 'r6rs';

import schemeCode from './baseLib.scm';

export default [
  new NativeProcedureValue('device-list', (list, machine) => {
    // This can be a little slow; we can cache the pairs I suppose.
    // Should it be a symbol or a string? Since symbol can be easily compared
    // by eq? in Scheme, we should use symbols.
    let clientList = PairValue.fromArray(
      machine.iotLogicEnv.clientList
        .filter(v => v.name !== '__server' || !v.host)
        .map(v => new SymbolValue(v.name))
    );
    return clientList;
  }, []),
  new NativeProcedureValue('device-alias', (list, machine) => {
    assert(list.car, 'symbol');
    let client = machine.iotLogicEnv.clientList.find(
      v => v.name === list.car.value
    );
    if (client == null) return BooleanValue.FALSE;
    return new StringValue(client.alias || client.name);
  }, ['name']),
  schemeCode
];
