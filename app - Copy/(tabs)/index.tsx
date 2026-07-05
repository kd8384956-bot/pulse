import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Platform, ActivityIndicator } from 'react-native';
import { useTranslation } from 'react-i18next';
import { GooglePlacesAutocomplete } from 'react-native-google-places-autocomplete';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';

export default function CalculatorScreen() {
  const { t } = useTranslation();
  const [landArea, setLandArea] = useState('');
  const [coverage, setCoverage] = useState('');
  const [location, setLocation] = useState<{
    latitude: number;
    longitude: number;
    address: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<null | {
    panels: number;
    power: number;
    cost: number;
    solarIrradiance: number;
  }>(null);
  const [weatherForecast, setWeatherForecast] = useState<{
    bestDays: Array<{
      date: string;
      sunshine: number;
      precipitation: number;
    }>;
    recommendedWeek: {
      start: string;
      end: string;
    } | null;
  } | null>(null);

  const getCurrentLocation = async () => {
    setLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        alert('Permission to access location was denied');
        return;
      }

      const location = await Location.getCurrentPositionAsync({});
      const address = await Location.reverseGeocodeAsync({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });

      const newLocation = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        address: address[0] ? `${address[0].city}, ${address[0].country}` : 'Location found',
      };

      setLocation(newLocation);
      fetchWeatherForecast(newLocation.latitude, newLocation.longitude);
    } catch (error) {
      console.error('Error getting location:', error);
      alert('Error getting location. Please try searching instead.');
    } finally {
      setLoading(false);
    }
  };

  const fetchWeatherForecast = async (latitude: number, longitude: number) => {
    try {
      const response = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&daily=precipitation_sum,sunshine_duration&timezone=auto`
      );
      const data = await response.json();
      
      const bestDays = [];
      let bestWeekStart = null;
      let bestWeekSunshine = 0;
      let currentWeekSunshine = 0;
      let currentWeekStart = null;

      for (let i = 0; i < data.daily.time.length; i++) {
        const date = data.daily.time[i];
        const sunshine = data.daily.sunshine_duration[i] / 3600; // Convert to hours
        const precipitation = data.daily.precipitation_sum[i];

        if (sunshine > 6 && precipitation < 5) {
          bestDays.push({ date, sunshine, precipitation });

          // Calculate best week
          if (!currentWeekStart) {
            currentWeekStart = date;
            currentWeekSunshine = sunshine;
          } else {
            currentWeekSunshine += sunshine;
            
            // Check if we have 7 days
            if (i % 7 === 6) {
              if (currentWeekSunshine > bestWeekSunshine) {
                bestWeekSunshine = currentWeekSunshine;
                bestWeekStart = currentWeekStart;
              }
              currentWeekStart = null;
              currentWeekSunshine = 0;
            }
          }
        }
      }

      const recommendedWeek = bestWeekStart ? {
        start: bestWeekStart,
        end: new Date(new Date(bestWeekStart).getTime() + 6 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      } : null;

      setWeatherForecast({ bestDays, recommendedWeek });
    } catch (error) {
      console.error('Error fetching weather forecast:', error);
    }
  };

  const calculateSolar = async () => {
    if (!location) {
      alert('Please select a location first');
      return;
    }

    const area = parseFloat(landArea);
    const coveragePercent = parseFloat(coverage);
    
    if (isNaN(area) || isNaN(coveragePercent)) return;

    setLoading(true);
    try {
      // Fetch solar irradiance data from NASA POWER API
      const response = await fetch(
        `https://power.larc.nasa.gov/api/temporal/daily/point?parameters=ALLSKY_SFC_SW_DWN&community=RE&longitude=${location.longitude}&latitude=${location.latitude}&start=20220101&end=20221231&format=JSON`
      );
      const data = await response.json();
      
      // Calculate average daily solar irradiance (kWh/m²/day)
      const yearlyData = Object.values(data.properties.parameter.ALLSKY_SFC_SW_DWN);
      const averageIrradiance = (yearlyData.reduce((a: any, b: any) => a + b, 0) / yearlyData.length) / 1000;

      const usableArea = area * (coveragePercent / 100);
      const panelArea = 1.7;
      const panelEfficiency = 0.2;
      const panelPower = 400;
      const costPerWatt = 70;

      const numberOfPanels = Math.floor(usableArea / panelArea);
      const totalPower = numberOfPanels * panelPower;
      const totalCost = totalPower * costPerWatt;

      setResult({
        panels: numberOfPanels,
        power: totalPower / 1000,
        cost: totalCost,
        solarIrradiance: averageIrradiance
      });
    } catch (error) {
      console.error('Error calculating solar data:', error);
      alert('Error fetching solar data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      weekday: 'short',
      month: 'short',
      day: 'numeric'
    });
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>{t('solarCalculator')}</Text>
        
        <View style={styles.locationSection}>
          <Text style={styles.sectionTitle}>{t('location')}</Text>
          
          <TouchableOpacity 
            style={styles.detectButton}
            onPress={getCurrentLocation}
          >
            <Ionicons name="location" size={20} color="white" />
            <Text style={styles.detectButtonText}>{t('detectLocation')}</Text>
          </TouchableOpacity>

          <Text style={styles.orText}>{t('or')}</Text>

          <View style={styles.searchContainer}>
            <GooglePlacesAutocomplete
              placeholder={t('searchLocation')}
              onPress={(data, details = null) => {
                if (details) {
                  const newLocation = {
                    latitude: details.geometry.location.lat,
                    longitude: details.geometry.location.lng,
                    address: data.description,
                  };
                  setLocation(newLocation);
                  fetchWeatherForecast(newLocation.latitude, newLocation.longitude);
                }
              }}
              query={{
                key: 'YOUR_GOOGLE_PLACES_API_KEY',
                language: 'en',
              }}
              styles={{
                textInput: styles.searchInput,
                listView: styles.searchList,
              }}
            />
          </View>

          {location && (
            <View style={styles.selectedLocation}>
              <Ionicons name="checkmark-circle" size={20} color="#10b981" />
              <Text style={styles.locationText}>{location.address}</Text>
            </View>
          )}
        </View>

        {weatherForecast && (
          <View style={styles.weatherSection}>
            <Text style={styles.sectionTitle}>{t('weatherForecast')}</Text>
            
            {weatherForecast.recommendedWeek && (
              <View style={styles.recommendedWeek}>
                <Text style={styles.recommendedTitle}>{t('recommendedWeek')}</Text>
                <Text style={styles.recommendedDates}>
                  {formatDate(weatherForecast.recommendedWeek.start)} - {formatDate(weatherForecast.recommendedWeek.end)}
                </Text>
              </View>
            )}

            <View style={styles.bestDays}>
              <Text style={styles.bestDaysTitle}>{t('bestDays')}</Text>
              {weatherForecast.bestDays.slice(0, 5).map((day, index) => (
                <View key={index} style={styles.dayRow}>
                  <Text style={styles.dayDate}>{formatDate(day.date)}</Text>
                  <View style={styles.dayDetails}>
                    <Text style={styles.daySunshine}>☀️ {day.sunshine.toFixed(1)}h</Text>
                    <Text style={styles.dayRain}>🌧 {day.precipitation}mm</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        <View style={styles.inputContainer}>
          <Text style={styles.label}>{t('landArea')}</Text>
          <TextInput
            style={styles.input}
            value={landArea}
            onChangeText={setLandArea}
            keyboardType="numeric"
            placeholder={t('enterLandArea')}
          />
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>{t('coverage')}</Text>
          <TextInput
            style={styles.input}
            value={coverage}
            onChangeText={setCoverage}
            keyboardType="numeric"
            placeholder={t('enterCoverage')}
          />
        </View>

        <TouchableOpacity 
          style={styles.button} 
          onPress={calculateSolar}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text style={styles.buttonText}>{t('calculate')}</Text>
          )}
        </TouchableOpacity>

        {result && (
          <View style={styles.resultContainer}>
            <Text style={styles.resultTitle}>{t('results')}</Text>
            <Text style={styles.resultText}>
              {t('numberOfPanels')}: {result.panels}
            </Text>
            <Text style={styles.resultText}>
              {t('totalPower')}: {result.power.toFixed(2)} kW
            </Text>
            <Text style={styles.resultText}>
              {t('solarIrradiance')}: {result.solarIrradiance.toFixed(2)} kWh/m²/day
            </Text>
            <Text style={styles.resultText}>
              {t('estimatedCost')}: ₹{result.cost.toLocaleString()}
            </Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f3f4f6',
  },
  card: {
    margin: 16,
    padding: 20,
    backgroundColor: 'white',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    color: '#1f2937',
  },
  locationSection: {
    marginBottom: 24,
  },
  weatherSection: {
    marginBottom: 24,
    backgroundColor: '#f8fafc',
    padding: 16,
    borderRadius: 8,
  },
  recommendedWeek: {
    backgroundColor: '#ecfdf5',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  recommendedTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#047857',
    marginBottom: 4,
  },
  recommendedDates: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#065f46',
  },
  bestDays: {
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 12,
  },
  bestDaysTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 12,
  },
  dayRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  dayDate: {
    fontSize: 16,
    color: '#374151',
    flex: 1,
  },
  dayDetails: {
    flexDirection: 'row',
    gap: 12,
  },
  daySunshine: {
    fontSize: 14,
    color: '#b45309',
  },
  dayRain: {
    fontSize: 14,
    color: '#1d4ed8',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
    color: '#374151',
  },
  detectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2563eb',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  detectButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  orText: {
    textAlign: 'center',
    color: '#6b7280',
    marginVertical: 12,
  },
  searchContainer: {
    marginBottom: 12,
  },
  searchInput: {
    height: 48,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 16,
  },
  searchList: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    backgroundColor: 'white',
    marginTop: 4,
  },
  selectedLocation: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0fdf4',
    padding: 12,
    borderRadius: 8,
  },
  locationText: {
    marginLeft: 8,
    color: '#047857',
    fontSize: 16,
  },
  inputContainer: {
    marginBottom: 16,
  },
  label: {
    fontSize: 16,
    marginBottom: 8,
    color: '#4b5563',
  },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  button: {
    backgroundColor: '#2563eb',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  resultContainer: {
    marginTop: 24,
    padding: 16,
    backgroundColor: '#f8fafc',
    borderRadius: 8,
  },
  resultTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
    color: '#1f2937',
  },
  resultText: {
    fontSize: 16,
    marginBottom: 8,
    color: '#4b5563',
  },
});