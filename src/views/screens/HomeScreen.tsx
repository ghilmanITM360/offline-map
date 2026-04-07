/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  SafeAreaView, 
  TextInput, 
  Pressable, 
  ScrollView, 
  Platform,
  StatusBar,
  Image
} from 'react-native';
import MapView, { Marker, Polygon, PROVIDER_GOOGLE, LocalTile } from 'react-native-maps';
import { 
  Menu, 
  Mic, 
  Navigation, 
  LocateFixed, 
  Plus, 
  Minus, 
  Compass, 
  Layers,
  Star,
  MapPin,
  ChevronRight,
  WifiOff,
  X,
  Clock,
  Share2,
  Info
} from 'lucide-react-native';
import BottomSheet, { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { useNavigation, DrawerActions } from '@react-navigation/native';
import { useHomeViewModel } from '../../viewmodels/HomeViewModel';
import { IJTEMA_DATA } from '../../constants/data';
import { Place, SearchResult } from '../../models/types';
import * as FileSystem from 'expo-file-system';

function isPlace(item: Place | SearchResult): item is Place {
  return 'name' in item;
}

function getDisplayName(item: Place | SearchResult): string {
  return isPlace(item) ? item.name : item.title;
}

export function HomeScreen() {
  const navigation = useNavigation<any>();
  const {
    mapRef,
    bottomSheetRef,
    mapType,
    searchQuery,
    searchResults,
    selectedPlace,
    recentSearches,
    snapPoints,
    initialRegion,
    isOffline,
    activeCategory,
    setIsMapReady,
    handleSearch,
    handlePlaceSelect,
    handleRecenter,
    handleZoomIn,
    handleZoomOut,
    toggleMapType,
    clearSearch,
    handleCategoryPress,
    setSelectedPlace
  } = useHomeViewModel();

  const tilePathTemplate = `${FileSystem.documentDirectory}tiles/{z}_{x}_{y}.png`;

  const renderChips = () => {
    const categories = [
      { id: 'blocks', label: 'Blocks', icon: 'grid' },
      { id: 'masjid', label: 'Masjid', icon: 'home' },
      { id: 'gates', label: 'Gates', icon: 'door-open' },
      { id: 'rastas', label: 'Rastas', icon: 'map' },
      { id: 'saved', label: 'Saved', icon: 'star' },
    ];

    return (
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false} 
        style={styles.chipsContainer}
        contentContainerStyle={styles.chipsContent}
      >
        {categories.map((cat) => (
          <Pressable 
            key={cat.id} 
            style={[
              styles.chip,
              activeCategory === cat.id && styles.activeChip
            ]}
            onPress={() => handleCategoryPress(cat.id)}
          >
            <Text style={[
              styles.chipText,
              activeCategory === cat.id && styles.activeChipText
            ]}>
              {cat.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={PROVIDER_GOOGLE}
        initialRegion={initialRegion}
        mapType={isOffline ? 'none' : mapType}
        showsUserLocation={true}
        showsMyLocationButton={false}
        showsCompass={false}
        onMapReady={() => setIsMapReady(true)}
        onPress={() => {
          if (searchQuery) clearSearch();
          if (selectedPlace) setSelectedPlace(null);
        }}
      >
        {/* Offline Tile Support */}
        {isOffline && (
          <LocalTile
            pathTemplate={tilePathTemplate}
            tileSize={256}
            zIndex={-1}
          />
        )}

        {/* Render Blocks */}
        {Object.entries(IJTEMA_DATA.blocks).map(([id, block]) => block.corners && (
          <Polygon
            key={id}
            coordinates={block.corners}
            fillColor="rgba(46, 125, 50, 0.15)"
            strokeColor="#2E7D32"
            strokeWidth={1.5}
            tappable={true}
            onPress={() => handlePlaceSelect({
              id: block.id,
              name: block.name,
              urduName: block.urduName,
              category: 'Block',
              coordinate: block.center,
              description: `Block ${block.name} of the Karachi Ijtema ground. Contains ${block.gates.length} gates.`
            })}
          />
        ))}

        {/* Selected Place Marker */}
        {selectedPlace && (
          <Marker coordinate={selectedPlace.coordinate}>
            <View style={styles.selectedMarker}>
              <MapPin size={32} color="#EA4335" fill="#EA4335" />
            </View>
          </Marker>
        )}
      </MapView>

      {/* Top UI Elements */}
      <SafeAreaView style={styles.topOverlay} pointerEvents="box-none">
        <View style={styles.searchBarContainer}>
          <Pressable 
            onPress={() => navigation.dispatch(DrawerActions.openDrawer())}
            style={styles.iconButton}
          >
            <Menu size={24} color="#5F6368" />
          </Pressable>
          <TextInput
            style={styles.searchInput}
            placeholder="Search here"
            placeholderTextColor="#70757A"
            value={searchQuery}
            onChangeText={handleSearch}
          />
          {searchQuery.length > 0 ? (
            <Pressable onPress={clearSearch} style={styles.iconButton}>
              <X size={20} color="#5F6368" />
            </Pressable>
          ) : (
            <Pressable style={styles.iconButton}>
              <Mic size={22} color="#4285F4" />
            </Pressable>
          )}
          <View style={styles.divider} />
          <Pressable style={styles.profileButton}>
            <View style={styles.profileInitial}>
              <Text style={styles.profileInitialText}>K</Text>
            </View>
          </Pressable>
        </View>

        {/* Search Results Dropdown */}
        {(searchResults.length > 0 || (searchQuery.length === 0 && recentSearches.length > 0)) && (
          <View style={styles.searchResultsContainer}>
            <ScrollView keyboardShouldPersistTaps="handled">
              {searchQuery.length === 0 && recentSearches.length > 0 && (
                <View style={styles.searchSectionHeader}>
                  <Text style={styles.searchSectionTitle}>Recent searches</Text>
                </View>
              )}
              
              {(searchQuery.length > 0 ? searchResults : recentSearches).map((place) => (
                <Pressable 
                  key={place.id} 
                  style={styles.searchResultItem}
                  onPress={() => handlePlaceSelect(place as any)}
                >
                  <View style={styles.searchResultIcon}>
                    {searchQuery.length === 0 ? <Clock size={18} color="#70757A" /> : <MapPin size={18} color="#70757A" />}
                  </View>
                  <View style={styles.searchResultText}>
                    <Text style={styles.searchResultName}>{getDisplayName(place)}</Text>
                    <Text style={styles.searchResultCategory}>{place.category}</Text>
                  </View>
                  <ChevronRight size={18} color="#BDC1C6" />
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}

        {renderChips()}
      </SafeAreaView>

      {/* Offline Indicator */}
      {isOffline && (
        <View style={styles.offlineIndicator}>
          <WifiOff size={14} color="#FFFFFF" />
          <Text style={styles.offlineText}>Offline</Text>
        </View>
      )}

      {/* Map Controls */}
      <View style={styles.rightControls}>
        <Pressable style={styles.controlButton} onPress={toggleMapType}>
          <Layers size={22} color="#5F6368" />
        </Pressable>
        <Pressable style={styles.controlButton}>
          <Compass size={22} color="#5F6368" />
        </Pressable>
        <View style={styles.zoomControls}>
          <Pressable style={styles.zoomButton} onPress={handleZoomIn}>
            <Plus size={22} color="#5F6368" />
          </Pressable>
          <View style={styles.zoomDivider} />
          <Pressable style={styles.zoomButton} onPress={handleZoomOut}>
            <Minus size={22} color="#5F6368" />
          </Pressable>
        </View>
      </View>

      <View style={styles.bottomControls}>
        <Pressable style={styles.recenterButton} onPress={handleRecenter}>
          <LocateFixed size={24} color="#4285F4" />
        </Pressable>
      </View>

      {/* Bottom Sheet for Place Details */}
      <BottomSheet
        ref={bottomSheetRef}
        index={-1}
        snapPoints={snapPoints}
        enablePanDownToClose
        handleIndicatorStyle={styles.sheetIndicator}
      >
        <BottomSheetScrollView contentContainerStyle={styles.bottomSheetContent}>
          {selectedPlace ? (
            <View style={styles.placeDetails}>
              <View style={styles.placeHeader}>
                <View style={styles.placeTitleContainer}>
                  <Text style={styles.placeName}>{selectedPlace.name}</Text>
                  <Text style={styles.placeCategory}>{selectedPlace.category}</Text>
                </View>
                <Pressable style={styles.closeSheetButton} onPress={() => bottomSheetRef.current?.close()}>
                  <X size={24} color="#5F6368" />
                </Pressable>
              </View>

              <View style={styles.placeQuickActions}>
                <Pressable 
                  style={styles.directionsButton} 
                  onPress={() => navigation.navigate('Directions', { destination: selectedPlace })}
                >
                  <Navigation size={20} color="#FFFFFF" />
                  <Text style={styles.directionsButtonText}>Directions</Text>
                </Pressable>
                <Pressable style={styles.actionCircle}>
                  <Star size={20} color="#1A73E8" />
                  <Text style={styles.actionLabel}>Save</Text>
                </Pressable>
                <Pressable style={styles.actionCircle}>
                  <Share2 size={20} color="#1A73E8" />
                  <Text style={styles.actionLabel}>Share</Text>
                </Pressable>
                <Pressable style={styles.actionCircle}>
                  <Info size={20} color="#1A73E8" />
                  <Text style={styles.actionLabel}>Info</Text>
                </Pressable>
              </View>

              <View style={styles.placeInfoSection}>
                <View style={styles.infoRow}>
                  <MapPin size={20} color="#1A73E8" />
                  <Text style={styles.infoText}>Karachi Ijtema Ground, Block {selectedPlace.name}</Text>
                </View>
                {selectedPlace.urduName && (
                  <View style={styles.infoRow}>
                    <Text style={styles.urduText}>{selectedPlace.urduName}</Text>
                  </View>
                )}
                <View style={styles.infoRow}>
                  <Clock size={20} color="#70757A" />
                  <Text style={styles.infoText}>Open 24 hours during Ijtema</Text>
                </View>
              </View>

              <Text style={styles.placeDesc}>{selectedPlace.description}</Text>
              
              <View style={styles.placeImageContainer}>
                <Image 
                  source={{ uri: `https://picsum.photos/seed/${selectedPlace.id}/400/200` }}
                  style={styles.placeImage}
                  referrerPolicy="no-referrer"
                />
              </View>
            </View>
          ) : (
            <View style={styles.emptySheet}>
              <Text style={styles.emptySheetText}>Select a place to see details</Text>
            </View>
          )}
        </BottomSheetScrollView>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  topOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
    zIndex: 10,
  },
  searchBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 12,
    marginTop: 8,
    borderRadius: 24,
    paddingHorizontal: 8,
    height: 48,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  iconButton: {
    padding: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#202124',
    paddingHorizontal: 4,
  },
  divider: {
    width: 1,
    height: 24,
    backgroundColor: '#DADCE0',
    marginHorizontal: 4,
  },
  profileButton: {
    padding: 4,
    marginRight: 4,
  },
  profileInitial: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#1A73E8',
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileInitialText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  searchResultsContainer: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 12,
    marginTop: 4,
    borderRadius: 16,
    maxHeight: 400,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    overflow: 'hidden',
  },
  searchSectionHeader: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  searchSectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#70757A',
    textTransform: 'uppercase',
  },
  searchResultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F3F4',
  },
  searchResultIcon: {
    width: 40,
    alignItems: 'center',
  },
  searchResultText: {
    flex: 1,
    marginLeft: 4,
  },
  searchResultName: {
    fontSize: 15,
    color: '#202124',
    fontWeight: '500',
  },
  searchResultCategory: {
    fontSize: 13,
    color: '#70757A',
    marginTop: 1,
  },
  chipsContainer: {
    marginTop: 12,
  },
  chipsContent: {
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  chip: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 18,
    marginRight: 8,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    borderWidth: 1,
    borderColor: '#DADCE0',
    flexDirection: 'row',
    alignItems: 'center',
  },
  activeChip: {
    backgroundColor: '#E8F0FE',
    borderColor: '#1A73E8',
  },
  chipText: {
    fontSize: 14,
    color: '#3C4043',
    fontWeight: '500',
  },
  activeChipText: {
    color: '#1A73E8',
  },
  rightControls: {
    position: 'absolute',
    top: 180,
    right: 12,
    zIndex: 5,
  },
  controlButton: {
    backgroundColor: '#FFFFFF',
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  zoomControls: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  zoomButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  zoomDivider: {
    height: 1,
    backgroundColor: '#DADCE0',
    marginHorizontal: 8,
  },
  bottomControls: {
    position: 'absolute',
    bottom: 20,
    right: 12,
    zIndex: 5,
  },
  recenterButton: {
    backgroundColor: '#FFFFFF',
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  offlineIndicator: {
    position: 'absolute',
    top: 140,
    left: 12,
    backgroundColor: 'rgba(32, 33, 36, 0.9)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    zIndex: 10,
  },
  offlineText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 6,
  },
  sheetIndicator: {
    backgroundColor: '#DADCE0',
    width: 36,
  },
  bottomSheetContent: {
    padding: 0,
  },
  placeDetails: {
    flex: 1,
  },
  placeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  placeTitleContainer: {
    flex: 1,
  },
  placeName: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#202124',
  },
  placeCategory: {
    fontSize: 14,
    color: '#70757A',
    marginTop: 2,
  },
  closeSheetButton: {
    padding: 4,
  },
  placeQuickActions: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginTop: 20,
    marginBottom: 16,
  },
  directionsButton: {
    backgroundColor: '#1A73E8',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 24,
    marginRight: 16,
  },
  directionsButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
    marginLeft: 8,
  },
  actionCircle: {
    alignItems: 'center',
    marginRight: 20,
  },
  actionLabel: {
    fontSize: 11,
    color: '#1A73E8',
    marginTop: 4,
    fontWeight: '500',
  },
  placeInfoSection: {
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#F1F3F4',
    paddingVertical: 16,
    paddingHorizontal: 20,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  infoText: {
    fontSize: 14,
    color: '#3C4043',
    marginLeft: 12,
  },
  urduText: {
    fontSize: 18,
    color: '#2E7D32',
    fontWeight: 'bold',
    textAlign: 'right',
    flex: 1,
  },
  placeDesc: {
    fontSize: 14,
    color: '#3C4043',
    lineHeight: 20,
    paddingHorizontal: 20,
    marginTop: 16,
  },
  placeImageContainer: {
    marginTop: 20,
    paddingHorizontal: 20,
    paddingBottom: 30,
  },
  placeImage: {
    width: '100%',
    height: 180,
    borderRadius: 12,
    backgroundColor: '#F1F3F4',
  },
  emptySheet: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 60,
  },
  emptySheetText: {
    color: '#70757A',
    fontSize: 15,
  },
  selectedMarker: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
