import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';

export default function SettingsScreen() {
  const { t, i18n } = useTranslation();

  const changeLanguage = (lng: string) => {
    i18n.changeLanguage(lng);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('language')}</Text>
      <View style={styles.languageContainer}>
        <TouchableOpacity
          style={[
            styles.languageButton,
            i18n.language === 'en' && styles.activeLanguage,
          ]}
          onPress={() => changeLanguage('en')}
        >
          <Text style={[
            styles.languageText,
            i18n.language === 'en' && styles.activeLanguageText,
          ]}>English</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.languageButton,
            i18n.language === 'hi' && styles.activeLanguage,
          ]}
          onPress={() => changeLanguage('hi')}
        >
          <Text style={[
            styles.languageText,
            i18n.language === 'hi' && styles.activeLanguageText,
          ]}>हिंदी</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.languageButton,
            i18n.language === 'ml' && styles.activeLanguage,
          ]}
          onPress={() => changeLanguage('ml')}
        >
          <Text style={[
            styles.languageText,
            i18n.language === 'ml' && styles.activeLanguageText,
          ]}>മലയാളം</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#f3f4f6',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 24,
    color: '#1f2937',
  },
  languageContainer: {
    gap: 12,
  },
  languageButton: {
    padding: 16,
    backgroundColor: 'white',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  activeLanguage: {
    backgroundColor: '#2563eb',
  },
  languageText: {
    fontSize: 18,
    textAlign: 'center',
    color: '#1f2937',
  },
  activeLanguageText: {
    color: 'white',
  },
});