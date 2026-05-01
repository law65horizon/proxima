import { usePropertyStore } from "@/stores/usePropertyStore";
import { useTheme } from "@/theme/theme";
import { AddressDetails } from "@/types/type";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { router } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import Animated, { SlideInUp, SlideOutDown } from "react-native-reanimated";
import { WebView } from "react-native-webview";

const {width } = Dimensions.get('screen')

export default function LocationScreen() {
  const { theme } = useTheme();
  const [isMapOpen, setIsMapOpen] = useState(false);
  const addressInitial = usePropertyStore((state) => state.address)
  const setField = usePropertyStore((state) => state.setField);
  const [formData, setFormData] = useState<AddressDetails>({
    street: addressInitial?.street || "",
    city: addressInitial?.city || "",
    state: addressInitial?.state || "",
    country: addressInitial?.country || "",
    postcode: addressInitial?.postcode || "",
    latitude: addressInitial?.latitude || undefined,
    longitude: addressInitial?.longitude || undefined
  });

  console.log({formData})
  const [markerCoords, setMarkerCoords] = useState({
    latitude: 0,
    longitude: 0,
  });
  // const [address, setAddress] = useState<any | null>(addressInitial || null);
  const [loadingAddress, setLoadingAddress] = useState(false);

  // preload approximate location
  useEffect(() => {
    fetch("https://ipapi.co/json/")
      .then((r) => r.json())
      .then((data) => {
        const { latitude, longitude } = data;
        setMarkerCoords({ latitude, longitude });
      })
      .catch(() => {
        setMarkerCoords({ latitude: 6.5244, longitude: 3.3792 }); // fallback: Lagos
      });
  }, []);

  const handleFormSubmit = async () => {
    const query = ` ${formData.city}, ${formData.state}, ${formData.country}`;
    setLoadingAddress(true);
    try {
      console.log({query: query.length})
      if (query.length <= 7) {
        setIsMapOpen(true);
      }
      else {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
            query
          )}&limit=1`
        );
        const data = await res.json();
        console.log({data})
        if (data[0]) {
          const { lat, lon } = data[0];
          setMarkerCoords({
            latitude: parseFloat(lat),
            longitude: parseFloat(lon),
          });
          setIsMapOpen(true);
          fetchAddress(parseFloat(lat), parseFloat(lon));
        }
      }
    } finally {
      setLoadingAddress(false);
    }
  };

  const fetchAddress = async (lat: number, lon: number) => {
    setLoadingAddress(true);
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&addressdetails=1`;
      const r = await fetch(url);
      const j = await r.json();
      const addr = j.address || {};
      const details: AddressDetails = {
        country: addr.country,
        state: addr.state,
        city: addr.city || addr.town || addr.village,
        postcode: addr.postcode,
        road: addr.road,
        display_name: j.display_name,
        latitude: lat,
        longitude: lon,
      };
      setFormData({country: details.country, city: details.city, postcode: details.postcode, street: details.street ||'', state: details.state, longitude: details.longitude, latitude: details.latitude})
    } finally {
      setLoadingAddress(false);
    }
  };

  // 🔹 Use expo-location to fetch user location
  const handleUseCurrentLocation = async () => {
    let { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") {
      alert("Permission denied to access location");
      return;
    }
    let loc = await Location.getCurrentPositionAsync({});
    const { latitude, longitude } = loc.coords;
    setMarkerCoords({ latitude, longitude });
    // setIsMapOpen(true);
    console.log({loc})
    fetchAddress(latitude, longitude);
  };

  console.log({isMapOpen})

  const validateStep = () => {
    if (!formData.street?.trim() || !formData.city.trim() || !formData.country.trim()) {
      Alert.alert('Missing Information', 'Please complete all address fields');
      return false;
    }
    return true;
  }
  

  const handleNext = () => {
    if (validateStep() || 2<3) {
      if (formData !== addressInitial) setField('address', formData)
      router.push({
        pathname: '/listing/edit/description_amenities',
      });
    }
  };

  const mapHTML = useMemo(() => {
    return `
      <!DOCTYPE html><html><head>
        <meta name="viewport" content="initial-scale=1.0, maximum-scale=1.0"/>
        <link rel="stylesheet" href="https://unpkg.com/leaflet/dist/leaflet.css"/>
        <style>body,html,#map{margin:0;padding:0;height:100%;width:100%;}</style>
      </head><body>
        <div id="map"></div>
        <script src="https://unpkg.com/leaflet/dist/leaflet.js"></script>
        <script>
          const lat = ${markerCoords.latitude};
          const lng = ${markerCoords.longitude};
          const map = L.map('map').setView([lat, lng], 16);

          // 🔹 Switch to a tileset with landmarks/buildings
          L.tileLayer('https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png',{
            maxZoom: 20,
            attribution: '&copy; OpenStreetMap contributors, HOT'
          }).addTo(map);

          const marker = L.marker([lat, lng], { draggable:true }).addTo(map);
          marker.on('dragend', () => {
            const { lat, lng } = marker.getLatLng();
            window.ReactNativeWebView.postMessage(JSON.stringify({ lat, lng }));
          });
        </script>
      </body></html>
    `;
  }, [markerCoords.latitude, markerCoords.longitude]);

  const onWebMessage = (evt: any) => {
    try {
      const { lat, lng } = JSON.parse(evt.nativeEvent.data);
      setMarkerCoords({ latitude: lat, longitude: lng });
      fetchAddress(lat, lng);
    } catch {}
  };

  const handleBack = () => {
    router.back();
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={[styles.header, { backgroundColor: theme.colors.background }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-back" size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <Text style={[styles.headerStep, { color: theme.colors.textSecondary }]}>
            Step 2 of 6
          </Text>
          <Text style={[styles.headerTitle, { color: theme.colors.text }]}>
            Location
          </Text>
        </View>
      </View>
      
      {/* Progress Bar */}
      <View style={[styles.progressContainer, { backgroundColor: theme.colors.backgroundSec }]}>
        <View style={[styles.progressBar, { backgroundColor: theme.colors.primary, width: '35%' }]} />
      </View>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >

        {/* Location */}
        <View style={styles.section}>

          <View style={styles.inputGroup}>
            <Text style={[styles.inputLabel, { color: theme.colors.textSecondary }]}>
              Street Address *
            </Text>
            <TextInput
              style={[
                styles.input,
                { backgroundColor: theme.colors.backgroundInput, color: theme.colors.text }
              ]}
              placeholder="123 Main Street"
              placeholderTextColor={theme.colors.textPlaceholder}
              value={formData.street}
              onChangeText={(text) => setFormData({...formData, street: text})}
            />
          </View>

          <View style={styles.inputRow}>
            <View style={[styles.inputGroup, { flex: 2 }]}>
              <Text style={[styles.inputLabel, { color: theme.colors.textSecondary }]}>
                City *
              </Text>
              <TextInput
                style={[ 
                  styles.input,
                  { backgroundColor: theme.colors.backgroundInput, color: theme.colors.text }
                ]}
                placeholder="New York"
                placeholderTextColor={theme.colors.textPlaceholder}
                value={formData.city}
                onChangeText={(text) => setFormData({...formData, city: text})}
              />
            </View>

            <View style={[styles.inputGroup, { flex: 1 }]}>
              <Text style={[styles.inputLabel, { color: theme.colors.textSecondary }]}>
                Postal Code
              </Text>
              <TextInput
                style={[
                  styles.input,
                  { backgroundColor: theme.colors.backgroundInput, color: theme.colors.text }
                ]}
                placeholder="10001"
                placeholderTextColor={theme.colors.textPlaceholder}
                value={formData.postcode}
                onChangeText={(text) => setFormData({...formData, postcode: text})}
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={[styles.inputLabel, { color: theme.colors.textSecondary }]}>
              State *
            </Text>
            <TextInput
              style={[
                styles.input,
                { backgroundColor: theme.colors.backgroundInput, color: theme.colors.text }
              ]}
              placeholder="United States"
              placeholderTextColor={theme.colors.textPlaceholder}
              value={formData.state}
              onChangeText={(text) => setFormData({...formData, state: text})}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={[styles.inputLabel, { color: theme.colors.textSecondary }]}>
              Country *
            </Text>
            <TextInput
              style={[
                styles.input,
                { backgroundColor: theme.colors.backgroundInput, color: theme.colors.text }
              ]}
              placeholder="United States"
              placeholderTextColor={theme.colors.textPlaceholder}
              value={formData.country}
              onChangeText={(text) => setFormData({...formData, country: text})}
            />
          </View>
        </View>

        <TouchableOpacity
          onPress={handleFormSubmit}
          style={{
            backgroundColor: theme.colors.primary,
            padding: 16,
            borderRadius: 10,
            alignItems: "center",
            marginTop: 10,
          }}
        >
          {/* {loadingAddress ? <ActivityIndicator /> : */}
            <Text style={{ color: "#fff", fontSize: 16, fontWeight: "600" }}>
              Locate on Map
            </Text>
          {/* } */}
        </TouchableOpacity>

        {/* Use Current Location button */}
        <TouchableOpacity
          onPress={handleUseCurrentLocation}
          style={{
            backgroundColor: theme.colors.accent,
            padding: 16,
            borderRadius: 10,
            alignItems: "center",
            marginTop: 12,
          }}
        >
          {loadingAddress ? <ActivityIndicator /> :
            <Text style={{ color: "#fff", fontSize: 16, fontWeight: "600" }}>
              Use Current Location
            </Text>
          }
        </TouchableOpacity>

      </ScrollView>

      {/* Bottom Navigation */}
      <View style={[styles.bottomNav, { backgroundColor: theme.colors.background }]}>
              <TouchableOpacity
                style={[styles.backNavButton, { backgroundColor: theme.colors.card }]}
                onPress={handleBack}
              >
                <Ionicons name="arrow-back" size={20} color={theme.colors.text} />
                <Text style={[styles.backNavText, { color: theme.colors.text }]}>Back</Text>
              </TouchableOpacity>
      
              <TouchableOpacity
                style={[styles.nextButton, { backgroundColor: theme.colors.primary }]}
                onPress={handleNext}
                activeOpacity={0.8}
              >
                <Text style={styles.nextButtonText}>Continue</Text>
                <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

      {/* Map Modal */}
      <Modal visible={isMapOpen} transparent animationType="none">
        <Animated.View
          entering={SlideInUp.springify().damping(15)}
          exiting={SlideOutDown}
          style={{
            flex: 1,
            backgroundColor: theme.colors.card,
            // paddingVertical:
            overflow: "hidden",
            paddingTop: 60
          }}
        >
          <View style={{ flex: 1, }}>
            <WebView
              source={{ html: mapHTML }}
              onMessage={onWebMessage}
              style={{ flex: 1, borderTopLeftRadius: 24,
            borderTopRightRadius: 24,}}
            />
          </View>
          <TouchableOpacity
            onPress={() => setIsMapOpen(false)}
            style={{
              padding: 16,
              alignItems: "center",
              backgroundColor: theme.colors.text,
              paddingBottom: 40
            }}
          >
            <Text style={{ color: "#fff", fontSize: 16, fontWeight: "600" }}>
              Confirm Location
            </Text>
          </TouchableOpacity>
        </Animated.View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: {
    marginRight: 16,
  },
  headerContent: {
    flex: 1,
  },
  headerStep: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  progressContainer: {
    height: 4,
    marginHorizontal: 20,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    borderRadius: 2,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 100,
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
  },
  sectionSubtitle: {
    fontSize: 14,
    marginBottom: 16,
    lineHeight: 20,
  },
  typeGrid: {
    gap: 12,
  },
  typeCard: {
    padding: 20,
    borderRadius: 16,
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  typeTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 12,
    marginBottom: 4,
  },
  typeDescription: {
    fontSize: 13,
    textAlign: 'center',
  },
  roomBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  roomBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  saleTypeContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  saleTypeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  saleTypeText: {
    fontSize: 15,
    fontWeight: '600',
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    height: 50,
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 15,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 12,
  },
  bottomNav: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    gap: 12,
    padding: 20,
    paddingBottom: 30,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.05)',
  },
  backNavButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  backNavText: {
    fontSize: 16,
    fontWeight: '600',
  },
  nextButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 12,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  nextButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
});