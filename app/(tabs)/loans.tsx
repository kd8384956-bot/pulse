import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useTranslation } from 'react-i18next';

const loanSchemes = [
  {
    id: 1,
    name: 'Solar Home Finance',
    interestRate: 7.5,
    maxTenure: 15,
    maxAmount: 2000000,
    description: 'Special financing for residential solar installations',
  },
  {
    id: 2,
    name: 'Green Energy Loan',
    interestRate: 8.0,
    maxTenure: 10,
    maxAmount: 1500000,
    description: 'Quick approval solar panel financing solution',
  },
  {
    id: 3,
    name: 'Eco-Friendly Finance',
    interestRate: 6.9,
    maxTenure: 12,
    maxAmount: 2500000,
    description: 'Low interest rates for sustainable energy projects',
  },
];

export default function LoansScreen() {
  const { t } = useTranslation();
  const [loanAmount, setLoanAmount] = useState('');
  const [tenure, setTenure] = useState('');
  const [selectedScheme, setSelectedScheme] = useState(loanSchemes[0]);
  const [emi, setEmi] = useState<number | null>(null);

  const calculateEMI = () => {
    const P = parseFloat(loanAmount);
    const r = selectedScheme.interestRate / 12 / 100;
    const n = parseFloat(tenure) * 12;

    if (isNaN(P) || isNaN(n)) return;

    const emi = P * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1);
    setEmi(emi);
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('loanSchemes')}</Text>
        {loanSchemes.map((scheme) => (
          <TouchableOpacity
            key={scheme.id}
            style={[
              styles.schemeCard,
              selectedScheme.id === scheme.id && styles.selectedScheme,
            ]}
            onPress={() => setSelectedScheme(scheme)}
          >
            <Text style={styles.schemeName}>{scheme.name}</Text>
            <Text style={styles.schemeDetail}>
              {t('interestRate')}: {scheme.interestRate}%
            </Text>
            <Text style={styles.schemeDetail}>
              {t('maxTenure')}: {scheme.maxTenure} {t('years')}
            </Text>
            <Text style={styles.schemeDetail}>
              {t('maxAmount')}: ₹{scheme.maxAmount.toLocaleString()}
            </Text>
            <Text style={styles.schemeDescription}>{scheme.description}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('emiCalculator')}</Text>
        <View style={styles.card}>
          <View style={styles.inputContainer}>
            <Text style={styles.label}>{t('loanAmount')}</Text>
            <TextInput
              style={styles.input}
              value={loanAmount}
              onChangeText={setLoanAmount}
              keyboardType="numeric"
              placeholder={t('enterLoanAmount')}
            />
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>{t('loanTenure')} ({t('years')})</Text>
            <TextInput
              style={styles.input}
              value={tenure}
              onChangeText={setTenure}
              keyboardType="numeric"
              placeholder={t('enterTenure')}
            />
          </View>

          <TouchableOpacity style={styles.button} onPress={calculateEMI}>
            <Text style={styles.buttonText}>{t('calculateEMI')}</Text>
          </TouchableOpacity>

          {emi !== null && (
            <View style={styles.resultContainer}>
              <Text style={styles.resultTitle}>{t('monthlyEMI')}</Text>
              <Text style={styles.emiAmount}>₹{Math.round(emi).toLocaleString()}</Text>
            </View>
          )}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f3f4f6',
  },
  section: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 16,
    color: '#1f2937',
  },
  schemeCard: {
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  selectedScheme: {
    borderColor: '#2563eb',
    borderWidth: 2,
  },
  schemeName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 8,
  },
  schemeDetail: {
    fontSize: 14,
    color: '#4b5563',
    marginBottom: 4,
  },
  schemeDescription: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 8,
  },
  card: {
    backgroundColor: 'white',
    padding: 20,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
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
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  resultContainer: {
    marginTop: 24,
    alignItems: 'center',
  },
  resultTitle: {
    fontSize: 18,
    color: '#4b5563',
    marginBottom: 8,
  },
  emiAmount: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2563eb',
  },
});