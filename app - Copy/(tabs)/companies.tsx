import React from 'react';
import { View, Text, Image, StyleSheet, ScrollView, TouchableOpacity, Linking } from 'react-native';
import { useTranslation } from 'react-i18next';

const companies = [
  {
    id: 1,
    name: 'SolarTech India',
    image: 'https://images.unsplash.com/photo-1509391366360-2e959784a276?w=800',
    description: 'Leading solar solutions provider with 15+ years of experience',
    contact: '+91 98765 43210',
    email: 'contact@solartech.in',
    rating: 4.8,
  },
  {
    id: 2,
    name: 'GreenSun Solutions',
    image: 'https://images.unsplash.com/photo-1508514177221-188b1cf16e9d?w=800',
    description: 'Specialized in residential and commercial solar installations',
    contact: '+91 98765 43211',
    email: 'info@greensun.in',
    rating: 4.7,
  },
  {
    id: 3,
    name: 'EcoSolar Systems',
    image: 'https://images.unsplash.com/photo-1559302995-f1d6d0cb6c8e?w=800',
    description: 'Eco-friendly solar solutions for sustainable future',
    contact: '+91 98765 43212',
    email: 'support@ecosolar.in',
    rating: 4.9,
  },
];

export default function CompaniesScreen() {
  const { t } = useTranslation();

  const bookSlot = (company: typeof companies[0]) => {
    Linking.openURL(`mailto:${company.email}?subject=Book%20Consultation%20Slot&body=I%20would%20like%20to%20book%20a%20consultation%20slot%20for%20solar%20panel%20installation.`);
  };

  return (
    <ScrollView style={styles.container}>
      {companies.map((company) => (
        <View key={company.id} style={styles.card}>
          <Image
            source={{ uri: company.image }}
            style={styles.image}
            resizeMode="cover"
          />
          <View style={styles.content}>
            <View style={styles.header}>
              <Text style={styles.name}>{company.name}</Text>
              <View style={styles.ratingContainer}>
                <Text style={styles.rating}>★ {company.rating}</Text>
              </View>
            </View>
            <Text style={styles.description}>{company.description}</Text>
            <Text style={styles.contact}>{t('phone')}: {company.contact}</Text>
            <Text style={styles.contact}>{t('email')}: {company.email}</Text>
            
            <TouchableOpacity
              style={styles.button}
              onPress={() => bookSlot(company)}
            >
              <Text style={styles.buttonText}>{t('bookSlot')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f3f4f6',
    padding: 16,
  },
  card: {
    backgroundColor: 'white',
    borderRadius: 12,
    marginBottom: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  image: {
    width: '100%',
    height: 200,
  },
  content: {
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  name: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1f2937',
  },
  ratingContainer: {
    backgroundColor: '#f59e0b',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 16,
  },
  rating: {
    color: 'white',
    fontWeight: 'bold',
  },
  description: {
    fontSize: 16,
    color: '#4b5563',
    marginBottom: 12,
  },
  contact: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 4,
  },
  button: {
    backgroundColor: '#2563eb',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 12,
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
});