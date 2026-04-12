/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { IJTEMA_DATA } from '../constants/data';
import { getDistance } from 'geolib';
export class SnapToRoadService {
    /**
     * Snaps a coordinate to the nearest road/rasta within a 20m threshold.
     * If no road is found within the threshold, returns the original coordinate.
     */
    static snapToRoad(coord) {
        let nearestPoint = coord;
        let minDistance = 20; // 20 meters threshold
        IJTEMA_DATA.edges.forEach(edge => {
            const fromNode = IJTEMA_DATA.nodes[edge.from];
            const toNode = IJTEMA_DATA.nodes[edge.to];
            if (!fromNode || !toNode)
                return;
            const pointOnLine = this.getNearestPointOnLine({ latitude: coord.latitude, longitude: coord.longitude }, { latitude: fromNode.lat, longitude: fromNode.lng }, { latitude: toNode.lat, longitude: toNode.lng });
            const dist = getDistance({ latitude: coord.latitude, longitude: coord.longitude }, { latitude: pointOnLine.latitude, longitude: pointOnLine.longitude });
            if (dist < minDistance) {
                minDistance = dist;
                nearestPoint = {
                    latitude: pointOnLine.latitude,
                    longitude: pointOnLine.longitude,
                    heading: coord.heading
                };
            }
        });
        return nearestPoint;
    }
    static getNearestPointOnLine(p, a, b) {
        const atob = { x: b.longitude - a.longitude, y: b.latitude - a.latitude };
        const atop = { x: p.longitude - a.longitude, y: p.latitude - a.latitude };
        const len = atob.x * atob.x + atob.y * atob.y;
        let dot = atop.x * atob.x + atop.y * atob.y;
        const t = Math.min(1, Math.max(0, dot / len));
        return {
            latitude: a.latitude + atob.y * t,
            longitude: a.longitude + atob.x * t
        };
    }
}
