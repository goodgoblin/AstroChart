import type { Points } from './radix';
import type { AspectData, Settings } from './settings';
export interface FormedAspect {
    point: {
        name: string;
        position: number;
    };
    toPoint: {
        name: string;
        position: number;
    };
    aspect: {
        name: string;
        degree: number;
        color: string;
        orbit: number;
    };
    precision: string;
}
/**
 * How tight an aspect is: 1 at exact, 0 at the inclusion limit (orbit / 2).
 * Uses the unrounded positions, not the rounded `precision` string.
 */
export declare const getAspectTightness: (formed: FormedAspect) => number;
/**
 * Stroke width for an aspect line: exact aspects draw at ASPECT_STROKE_MAX,
 * aspects at the inclusion limit at ASPECT_STROKE_MIN, linear in between.
 */
export declare const getAspectStrokeWidth: (formed: FormedAspect, settings: Settings) => number;
/**
 * Orb-driven styling for an aspect line: width by tightness, dashed when the
 * orb is in the wide part of the range (tightness below ASPECT_DASH_BELOW).
 */
export declare const styleAspectLine: (line: Element, formed: FormedAspect, settings: Settings) => void;
/** Orb as degrees and minutes, e.g. 0°48′. */
export declare const formatOrb: (formed: FormedAspect) => string;
export interface ConjunctionImpact {
    group: Element;
    center: {
        x: number;
        y: number;
    };
}
export interface AspectHover {
    add: (line: Element, formed: FormedAspect, impact: ConjunctionImpact | null) => void;
}
/**
 * Hover/tap focus for aspects: the hovered aspect glows, the others fade, and a
 * label at the wheel's center shows the pair and its orb. Tap pins the label (touch); tap again clears.
 * Returns null when ASPECT_HOVER is off.
 */
export declare const createAspectHover: (wrapper: Element, cx: number, cy: number, settings: Settings) => AspectHover | null;
/**
 * Conjunction "impact": a solid core with ripple rings where the two bodies meet
 * on the aspect circle; bigger and brighter the tighter the conjunction.
 */
export declare const appendConjunctionImpact: (wrapper: Element, cx: number, cy: number, radius: number, shift: number, formed: FormedAspect, settings: Settings) => ConjunctionImpact | null;
/**
   * Aspects calculator
   *
   * @class
   * @public
   * @constructor
   * @param {AspectPoints} points; {"Sun":[0], "Moon":[90], "Neptune":[120], "As":[30]}
   * @param {Object | null } settings
   */
declare class AspectCalculator {
    settings: Partial<Settings>;
    toPoints: Points;
    context: this;
    constructor(toPoints: Points, settings?: Partial<Settings>);
    /**
     * Getter for this.toPoints
     * @see constructor
     *
     * @return {Object}
     */
    getToPoints(): Points;
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
    radix(points: Points): FormedAspect[];
    /**
     * Transit aspects
     *
     * @param {Object} points - transiting points; {"Sun":[0, 1], "Uranus":[90, -1], "NAME":[ANGLE, SPEED]};
     * @return {Array<Object>} [{"aspect":{"name":"conjunction", "degree":120}"", "point":{"name":"Sun", "position":123}, "toPoint":{"name":"Moon", "position":345}, "precision":0.5}]]
     */
    transit(points: Points): FormedAspect[];
    hasAspect(point: number, toPoint: number, aspect: AspectData): boolean;
    calcPrecision(point: number, toPoint: number, aspect: number): number;
    isTransitPointApproachingToAspect(aspect: number, toPoint: number, point: number): boolean;
    compareAspectsByPrecision(a: FormedAspect, b: FormedAspect): number;
}
export default AspectCalculator;
