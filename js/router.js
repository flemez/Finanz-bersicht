// Minimaler Hash-basierter Router (#/budget, #/accounts, ...).

const routes = new Map();
let notFound = null;

export function register(name, handler) {
  routes.set(name, handler);
}

export function setNotFound(handler) {
  notFound = handler;
}

export function currentRoute() {
  const hash = location.hash.replace(/^#\/?/, '');
  const [name, ...rest] = hash.split('/');
  return { name: name || 'budget', params: rest };
}

export function navigate(path) {
  location.hash = '#/' + path.replace(/^\/?#?\/?/, '');
}

export function startRouter() {
  const render = () => {
    const { name, params } = currentRoute();
    const handler = routes.get(name) || notFound;
    if (handler) handler(params);
  };
  window.addEventListener('hashchange', render);
  render();
}
