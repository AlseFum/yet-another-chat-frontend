export class Store {
  read(_workspace, _name) { throw new Error('Store.read() 未实现') }
  write(_workspace, _name, _value) { throw new Error('Store.write() 未实现') }
  patch(_workspace, _name, _value) { throw new Error('Store.patch() 未实现') }
  remove(_workspace, _name) { throw new Error('Store.remove() 未实现') }
  list(_workspace) { throw new Error('Store.list() 未实现') }
  readAll(_workspace) { throw new Error('Store.readAll() 未实现') }
  writeAll(_workspace, _value) { throw new Error('Store.writeAll() 未实现') }
}
