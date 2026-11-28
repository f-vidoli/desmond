const ALLOWED_TAGS = new Set([
  'article', 'section', 'div', 'span', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li', 'strong', 'em', 'small', 'button', 'details', 'summary'
])

function interpolate(text, values) {
  return String(text).replace(/{{\s*([\w.-]+)\s*}}/g, (match, key) =>
    Object.hasOwn(values, key) ? String(values[key]) : match
  )
}

export function populate(root, values = {}) {
  const elements = [root, ...root.querySelectorAll('*')]
  for (const element of elements) {
    for (const attribute of [...element.attributes]) {
      if (attribute.value.includes('{{')) {
        element.setAttribute(attribute.name, interpolate(attribute.value, values))
      }
    }
  }
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let node = walker.nextNode()
  while (node) {
    if (node.nodeValue.includes('{{')) node.nodeValue = interpolate(node.nodeValue, values)
    node = walker.nextNode()
  }
  return root
}

function hierarchyNode(spec) {
  if (typeof spec === 'string') {
    const element = document.createElement('p')
    element.textContent = spec
    return element
  }
  const tag = ALLOWED_TAGS.has(String(spec.tag).toLowerCase()) ? String(spec.tag).toLowerCase() : 'div'
  const element = document.createElement(tag)
  if (spec.class) element.className = String(spec.class)
  if (spec.text) element.textContent = String(spec.text)
  for (const child of spec.children || []) element.append(hierarchyNode(child))
  return element
}

async function templatePaths(host, pointer, wid) {
  const provider = pointer.widgets?.[wid] || 'default'
  if (provider === 'default') {
    return [
      `plugins/default-widgets/widgets/${wid}.html`,
      'plugins/default-widgets/widgets/widget.html'
    ]
  }
  return [
    `plugins/${provider}/widgets/${wid}.html`,
    `plugins/${provider}/widgets/${wid}`,
    'plugins/default-widgets/widgets/widget.html'
  ]
}

async function loadTemplate(host, paths) {
  for (const path of paths) {
    try {
      const template = document.createElement('template')
      template.innerHTML = await host.readText(path)
      if (template.content.firstElementChild) return template.content.firstElementChild
    } catch {
      continue
    }
  }
  const fallback = document.createElement('article')
  fallback.className = 'widget widget-base'
  fallback.textContent = 'Widget template not found'
  return fallback
}

export async function renderWidget(host, widget, pointer, depth = 0) {
  const wid = widget.wid || 'widget'
  const root = await loadTemplate(host, await templatePaths(host, pointer, wid))
  populate(root, widget.content || {})
  const hierarchy = root.querySelector('[data-slot="hierarchy"]') || root
  for (const spec of widget.hierarchy || []) hierarchy.append(hierarchyNode(spec))
  if (depth < 4) {
    const childrenSlot = root.querySelector('[data-slot="widgets"]') || root
    for (const child of widget.widgets || []) {
      childrenSlot.append(await renderWidget(host, child, pointer, depth + 1))
    }
  }
  return root
}

export async function renderTemplate(host, name, values = {}) {
  return populate(
    await loadTemplate(host, [`plugins/default-widgets/widgets/${name}.html`]),
    values
  )
}
