/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { useAppStore } from '../store/useAppStore';
/**
 * Thin service over Zustand favorites state.
 * All persistence is handled by the Zustand AsyncStorage middleware.
 */
export class FavoriteService {
    static toggleFavorite(place) {
        const store = useAppStore.getState();
        if (store.isFavorite(place.id)) {
            store.removeFavorite(place.id);
        }
        else {
            const fav = {
                id: `fav_${Date.now()}`,
                placeId: place.id,
                name: place.name,
                urduName: place.urduName,
                category: place.category,
                coordinate: place.coordinate,
                savedAt: new Date().toISOString(),
            };
            store.addFavorite(fav);
        }
    }
    static isFavorite(placeId) {
        return useAppStore.getState().isFavorite(placeId);
    }
    static getFavorites() {
        return useAppStore.getState().favorites;
    }
}
