import type { Points } from './radix'
import type { AspectData, Settings } from './settings'
import { radiansToDegree, getPointPosition } from './utils'

export interface FormedAspect {
  point: {
    name: string
    position: number
  }
  toPoint: {
    name: string
    position: number
  }
  aspect: {
    name: string
    degree: number
    color: string
    orbit: number
  }
  precision: string
}

/**
 * How tight an aspect is: 1 at exact, 0 at the inclusion limit (orbit / 2).
 * Uses the unrounded positions, not the rounded `precision` string.
 */
export const getAspectTightness = (formed: FormedAspect): number => {
  let gap = Math.abs(formed.point.position - formed.toPoint.position)
  if (gap > 180) {
    gap = 360 - gap
  }
  const orb = Math.abs(gap - formed.aspect.degree)
  const limit = formed.aspect.orbit / 2
  return limit > 0 ? 1 - Math.min(1, orb / limit) : 0
}

/**
 * Stroke width for an aspect line: exact aspects draw at ASPECT_STROKE_MAX,
 * aspects at the inclusion limit at ASPECT_STROKE_MIN, linear in between.
 */
export const getAspectStrokeWidth = (formed: FormedAspect, settings: Settings): number => {
  const width = settings.ASPECT_STROKE_MIN + (settings.ASPECT_STROKE_MAX - settings.ASPECT_STROKE_MIN) * getAspectTightness(formed)
  return width * settings.SYMBOL_SCALE
}

/**
 * Orb-driven styling for an aspect line: width by tightness, dashed when the
 * orb is in the wide part of the range (tightness below ASPECT_DASH_BELOW).
 */
export const styleAspectLine = (line: Element, formed: FormedAspect, settings: Settings): void => {
  line.setAttribute('stroke-width', getAspectStrokeWidth(formed, settings).toString())
  if (getAspectTightness(formed) < settings.ASPECT_DASH_BELOW) {
    const dash = 3 * settings.SYMBOL_SCALE
    line.setAttribute('stroke-dasharray', `${dash} ${dash * 0.8}`)
  }
}

const ASPECT_SYMBOLS: Record<string, string> = { conjunction: '\u260C', opposition: '\u260D', trine: '\u25B3', square: '\u25A1', sextile: '\u26B9' }

/** Orb as degrees and minutes, e.g. 0°48′. */
export const formatOrb = (formed: FormedAspect): string => {
  let gap = Math.abs(formed.point.position - formed.toPoint.position)
  if (gap > 180) {
    gap = 360 - gap
  }
  const totalMinutes = Math.round(Math.abs(gap - formed.aspect.degree) * 60)
  return `${Math.floor(totalMinutes / 60)}\u00B0${(totalMinutes % 60).toString().padStart(2, '0')}\u2032`
}

export interface ConjunctionImpact {
  group: Element
  center: { x: number; y: number }
}

/**
 * Hovered conjunction: a bright halo and rings that keep pulsing outward from
 * the meeting point, staggered like a shockwave.
 */
const appendImpactShockwave = (overlay: Element, impact: ConjunctionImpact, formed: FormedAspect, settings: Settings): void => {
  const ns = overlay.namespaceURI
  const scale = settings.SYMBOL_SCALE
  const color = formed.aspect.color === 'transparent' ? settings.ASPECT_CONJUNCTION_COLOR : formed.aspect.color
  const tightness = getAspectTightness(formed)
  const circle = (r: number): Element => {
    const c = document.createElementNS(ns, 'circle')
    c.setAttribute('cx', impact.center.x.toString())
    c.setAttribute('cy', impact.center.y.toString())
    c.setAttribute('r', r.toString())
    return c
  }
  const animate = (ring: Element, attr: string, from: number, to: number, begin: number): void => {
    const a = document.createElementNS(ns, 'animate')
    a.setAttribute('attributeName', attr)
    a.setAttribute('from', from.toString())
    a.setAttribute('to', to.toString())
    a.setAttribute('dur', '1.6s')
    a.setAttribute('begin', `${begin}s`)
    a.setAttribute('repeatCount', 'indefinite')
    ring.appendChild(a)
  }

  const halo = circle((5 + 5 * tightness) * scale)
  halo.setAttribute('fill', color)
  halo.setAttribute('fill-opacity', '0.35')
  overlay.insertBefore(halo, overlay.firstChild)

  const reach = (14 + 14 * tightness) * scale
  for (const begin of [0, 0.53, 1.07]) {
    const ring = circle(2 * scale)
    ring.setAttribute('fill', 'none')
    ring.setAttribute('stroke', color)
    ring.setAttribute('stroke-width', (1.2 * scale).toString())
    ring.setAttribute('stroke-opacity', '0')
    animate(ring, 'r', 2 * scale, reach, begin)
    animate(ring, 'stroke-opacity', 0.9, 0, begin)
    overlay.appendChild(ring)
  }
}

export interface AspectHover {
  add: (line: Element, formed: FormedAspect, impact: ConjunctionImpact | null) => void
}

/**
 * Hover/tap focus for aspects: the hovered aspect glows, the others fade, and a
 * label at the wheel's center shows the pair and its orb. Tap pins the label (touch); tap again clears.
 * Returns null when ASPECT_HOVER is off.
 */
export const createAspectHover = (wrapper: Element, cx: number, cy: number, settings: Settings): AspectHover | null => {
  if (!settings.ASPECT_HOVER) {
    return null
  }
  const ns = wrapper.namespaceURI
  const scale = settings.SYMBOL_SCALE
  const filterId = wrapper.id + '-glow'

  const defs = document.createElementNS(ns, 'defs')
  const filter = document.createElementNS(ns, 'filter')
  filter.setAttribute('id', filterId)
  // userSpaceOnUse: a horizontal/vertical line has a zero-height bbox, which would clip a bbox-relative filter
  filter.setAttribute('filterUnits', 'userSpaceOnUse')
  filter.setAttribute('x', '0')
  filter.setAttribute('y', '0')
  filter.setAttribute('width', '100%')
  filter.setAttribute('height', '100%')
  const blur = document.createElementNS(ns, 'feGaussianBlur')
  blur.setAttribute('stdDeviation', (2 * scale).toString())
  filter.appendChild(blur)
  defs.appendChild(filter)
  wrapper.appendChild(defs)

  // hit targets sit under the drawn lines; drawn lines and impacts ignore the pointer
  const hits = document.createElementNS(ns, 'g')
  wrapper.appendChild(hits)

  const visuals: Element[] = []
  let overlay: Element | null = null
  let pinned: Element | null = null

  const clear = (): void => {
    overlay?.remove()
    overlay = null
    for (const v of visuals) v.removeAttribute('opacity')
  }

  const show = (visual: Element, formed: FormedAspect, impact: ConjunctionImpact | null): void => {
    clear()
    for (const v of visuals) {
      if (v !== visual) v.setAttribute('opacity', '0.2')
    }
    overlay = document.createElementNS(ns, 'g')
    overlay.setAttribute('pointer-events', 'none')

    const glow = visual.cloneNode(true) as Element
    glow.removeAttribute('opacity')
    glow.setAttribute('filter', `url(#${filterId})`)
    if (glow.tagName === 'line') {
      glow.removeAttribute('stroke-dasharray')
      glow.setAttribute('stroke-width', (parseFloat(visual.getAttribute('stroke-width') ?? '1') * 3).toString())
      glow.setAttribute('stroke-opacity', '0.45')
    }
    overlay.appendChild(glow)
    const crisp = visual.cloneNode(true) as Element
    crisp.removeAttribute('opacity')
    overlay.appendChild(crisp)
    if (impact != null) {
      appendImpactShockwave(overlay, impact, formed, settings)
    }

    const text = document.createElementNS(ns, 'text')
    const symbol = ASPECT_SYMBOLS[formed.aspect.name] ?? formed.aspect.name
    text.textContent = `${formed.point.name} ${symbol} ${formed.toPoint.name} \u00B7 orb ${formatOrb(formed)}`
    text.setAttribute('x', cx.toString())
    text.setAttribute('y', cy.toString())
    text.setAttribute('text-anchor', 'middle')
    text.setAttribute('dominant-baseline', 'middle')
    text.setAttribute('font-size', (10 * scale).toString())
    text.setAttribute('font-family', 'sans-serif')
    text.setAttribute('fill', settings.POINTS_COLOR)
    text.setAttribute('stroke', settings.COLOR_BACKGROUND)
    text.setAttribute('stroke-width', (3 * scale).toString())
    text.setAttribute('paint-order', 'stroke')
    overlay.appendChild(text)
    wrapper.appendChild(overlay)
  }

  return {
    add: (line, formed, impact) => {
      const visual = impact != null ? impact.group : line
      line.setAttribute('pointer-events', 'none')
      visual.setAttribute('pointer-events', 'none')
      visuals.push(visual)

      let hit: Element
      if (impact != null) {
        hit = document.createElementNS(ns, 'circle')
        hit.setAttribute('cx', impact.center.x.toString())
        hit.setAttribute('cy', impact.center.y.toString())
        hit.setAttribute('r', (12 * scale).toString())
        hit.setAttribute('fill', 'transparent')
      } else {
        hit = line.cloneNode(false) as Element
        for (const attr of Array.from(hit.attributes)) {
          if (attr.name.startsWith('data-') || attr.name === 'stroke-dasharray') hit.removeAttribute(attr.name)
        }
        hit.setAttribute('stroke', 'transparent')
        hit.setAttribute('stroke-width', (8 * scale).toString())
      }
      hit.setAttribute('pointer-events', 'all')
      hit.setAttribute('style', 'cursor: pointer')
      hit.addEventListener('mouseenter', () => { if (pinned == null) show(visual, formed, impact) })
      hit.addEventListener('mouseleave', () => { if (pinned == null) clear() })
      hit.addEventListener('click', () => {
        if (pinned === hit) {
          pinned = null
          clear()
        } else {
          pinned = hit
          show(visual, formed, impact)
        }
      })
      hits.appendChild(hit)
    }
  }
}

/**
 * Conjunction "impact": a solid core with ripple rings where the two bodies meet
 * on the aspect circle; bigger and brighter the tighter the conjunction.
 */
export const appendConjunctionImpact = (wrapper: Element, cx: number, cy: number, radius: number, shift: number, formed: FormedAspect, settings: Settings): ConjunctionImpact | null => {
  if (!settings.ASPECT_CONJUNCTION_IMPACT || formed.aspect.degree !== 0) {
    return null
  }
  const ns = wrapper.namespaceURI
  const tightness = getAspectTightness(formed)
  const color = formed.aspect.color === 'transparent' ? settings.ASPECT_CONJUNCTION_COLOR : formed.aspect.color
  const scale = settings.SYMBOL_SCALE

  // midpoint of the two positions, across the 0°/360° seam
  let diff = formed.point.position - formed.toPoint.position
  if (diff > 180) diff -= 360
  if (diff < -180) diff += 360
  const center = getPointPosition(cx, cy, radius, formed.toPoint.position + diff / 2 + shift, settings)

  const circle = (r: number): Element => {
    const c = document.createElementNS(ns, 'circle')
    c.setAttribute('cx', center.x.toString())
    c.setAttribute('cy', center.y.toString())
    c.setAttribute('r', r.toString())
    return c
  }

  const group = document.createElementNS(ns, 'g')
  group.setAttribute('pointer-events', 'none')
  group.setAttribute('data-name', formed.aspect.name)
  group.setAttribute('data-point', formed.point.name)
  group.setAttribute('data-toPoint', formed.toPoint.name)

  const core = circle((1.5 + 2 * tightness) * scale)
  core.setAttribute('fill', color)
  group.appendChild(core)

  for (const [k, opacity] of [[1, 0.8], [2, 0.4]]) {
    const ring = circle((1.5 + 2 * tightness + k * (2 + 3 * tightness)) * scale)
    ring.setAttribute('fill', 'none')
    ring.setAttribute('stroke', color)
    ring.setAttribute('stroke-width', (0.6 * scale).toString())
    ring.setAttribute('stroke-opacity', (opacity * (0.4 + 0.6 * tightness)).toString())
    group.appendChild(ring)
  }
  wrapper.appendChild(group)
  return { group, center }
}

const DEFAULT_ASPECTS = {
  conjunction: { degree: 0, orbit: 10, color: 'transparent' },
  square: { degree: 90, orbit: 8, color: '#FF4500' },
  trine: { degree: 120, orbit: 8, color: '#27AE60' },
  opposition: { degree: 180, orbit: 10, color: '#27AE60' }
}
/**
   * Aspects calculator
   *
   * @class
   * @public
   * @constructor
   * @param {AspectPoints} points; {"Sun":[0], "Moon":[90], "Neptune":[120], "As":[30]}
   * @param {Object | null } settings
   */
class AspectCalculator {
  settings: Partial<Settings>
  toPoints: Points
  context: this
  constructor (toPoints: Points, settings?: Partial<Settings>) {
    if (toPoints == null) {
      throw new Error('Param \'toPoint\' must not be empty.')
    }

    this.settings = settings ?? {}
    this.settings.ASPECTS = settings?.ASPECTS ?? DEFAULT_ASPECTS

    this.toPoints = toPoints

    this.context = this
  }

  /**
   * Getter for this.toPoints
   * @see constructor
   *
   * @return {Object}
   */
  getToPoints (): Points {
    return this.toPoints
  }

  /**
   * Radix aspects
   *
   * In radix calculation is the param "points" the same as param "toPoints" in constructor
   * , but without special points such as: As,Ds, Mc, Ic, ...
   *
   * @param {Object} points; {"Sun":[0], "Moon":[90]}
   *
   * @return {Array<Object>} [{"aspect":{"name":"conjunction", "degree":120}"", "point":{"name":"Sun", "position":123}, "toPoint":{"name":"Moon", "position":345}, "precision":0.5}]]
   */
  radix (points: Points): FormedAspect[] {
    if (points == null) {
      return []
    }

    const aspects: FormedAspect[] = []

    for (const point in points) {
      if (points.hasOwnProperty(point)) {
        for (const toPoint in this.toPoints) {
          if (this.toPoints.hasOwnProperty(toPoint)) {
            if (point !== toPoint) {
              for (const aspect in this.settings.ASPECTS) {
                if (this.hasAspect(points[point][0], this.toPoints[toPoint][0], this.settings.ASPECTS[aspect])) {
                  aspects.push(
                    {
                      aspect: { name: aspect, degree: this.settings.ASPECTS[aspect].degree, orbit: this.settings.ASPECTS[aspect].orbit, color: this.settings.ASPECTS[aspect].color },
                      point: { name: point, position: points[point][0] },
                      toPoint: { name: toPoint, position: this.toPoints[toPoint][0] },
                      precision: this.calcPrecision(points[point][0], this.toPoints[toPoint][0], this.settings.ASPECTS[aspect].degree).toFixed(4)
                    }
                  )
                }
              }
            }
          }
        }
      }
    }

    return aspects.sort(this.compareAspectsByPrecision)
  }

  /**
   * Transit aspects
   *
   * @param {Object} points - transiting points; {"Sun":[0, 1], "Uranus":[90, -1], "NAME":[ANGLE, SPEED]};
   * @return {Array<Object>} [{"aspect":{"name":"conjunction", "degree":120}"", "point":{"name":"Sun", "position":123}, "toPoint":{"name":"Moon", "position":345}, "precision":0.5}]]
   */
  transit (points: Points): FormedAspect[] {
    if (points == null) {
      return []
    }

    const aspects = []

    for (const point in points) {
      if (points.hasOwnProperty(point)) {
        for (const toPoint in this.toPoints) {
          if (this.toPoints.hasOwnProperty(toPoint)) {
            for (const aspect in this.settings.ASPECTS) {
              if (this.hasAspect(points[point][0], this.toPoints[toPoint][0], this.settings.ASPECTS[aspect])) {
                let precision = this.calcPrecision(points[point][0], this.toPoints[toPoint][0], this.settings.ASPECTS[aspect].degree)

                // -1 : is approaching to aspect
                // +1 : is moving away
                if (this.isTransitPointApproachingToAspect(this.settings.ASPECTS[aspect].degree, this.toPoints[toPoint][0], points[point][0])) {
                  precision *= -1
                }

                // if transit has speed value && transit is retrograde
                if (points[point][1] && points[point][1] < 0) {
                  precision *= -1
                }

                aspects.push(
                  {
                    aspect: { name: aspect, degree: this.settings.ASPECTS[aspect].degree, orbit: this.settings.ASPECTS[aspect].orbit, color: this.settings.ASPECTS[aspect].color },
                    point: { name: point, position: points[point][0] },
                    toPoint: { name: toPoint, position: this.toPoints[toPoint][0] },
                    precision: precision.toFixed(4)
                  }
                )
              }
            }
          }
        }
      }
    }

    return aspects.sort(this.compareAspectsByPrecision)
  }

  /*
  * @private
   * @param {double} point
   * @param {double} toPoint
   * @param {Array} aspects; [DEGREE, ORBIT]
   */
  hasAspect (point: number, toPoint: number, aspect: AspectData): boolean {
    let result = false

    let gap = Math.abs(point - toPoint)

    if (gap > radiansToDegree(Math.PI)) {
      gap = radiansToDegree(2 * Math.PI) - gap
    }

    const orbitMin = aspect.degree - (aspect.orbit / 2)
    const orbitMax = aspect.degree + (aspect.orbit / 2)

    if (orbitMin <= gap && gap <= orbitMax) {
      result = true
    }

    return result
  }

  /*
  * @private
   * @param {Object} pointAngle
   * @param {Object} toPointAngle
   * @param {double} aspectDegree;
   */
  calcPrecision (point: number, toPoint: number, aspect: number): number {
    let gap = Math.abs(point - toPoint)

    if (gap > radiansToDegree(Math.PI)) {
      gap = radiansToDegree(2 * Math.PI) - gap
    }
    return Math.abs(gap - aspect)
  }

  /*
   * Calculate direction of aspect
   * whether the transiting planet is approaching or is falling
   * @private
   *
   * //TODO
   * This method is tested, and for tests gives the right results.
   * But the code is totally unclear. It needs to be rewritten.
   * @param {double} aspect - aspect degree; for example 90.
   * @param {double} toPoint - angle of standing point
   * @param {double} point - angle of transiting planet
   * @return {boolean}
   */
  isTransitPointApproachingToAspect (aspect: number, toPoint: number, point: number): boolean {
    if ((point - toPoint) > 0) {
      if ((point - toPoint) > radiansToDegree(Math.PI)) {
        point = (point + aspect) % radiansToDegree(2 * Math.PI)
      } else {
        toPoint = (toPoint + aspect) % radiansToDegree(2 * Math.PI)
      }
    } else {
      if ((toPoint - point) > radiansToDegree(Math.PI)) {
        toPoint = (toPoint + aspect) % radiansToDegree(2 * Math.PI)
      } else {
        point = (point + aspect) % radiansToDegree(2 * Math.PI)
      }
    }

    let _point = point
    let _toPoint = toPoint

    const difference = _point - _toPoint

    if (Math.abs(difference) > radiansToDegree(Math.PI)) {
      _point = toPoint
      _toPoint = point
    }

    return (_point - _toPoint < 0)
  }

  /*
   * Aspects comparator
   * by precision
   * @private
   * @param {Object} a
   * @param {Object} b
   */
  compareAspectsByPrecision (a: FormedAspect, b: FormedAspect): number {
    return parseFloat(a.precision) - parseFloat(b.precision)
  }
}

export default AspectCalculator
