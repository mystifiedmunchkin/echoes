/** Sign-in, registration, and account-management modal. */
import React, { useState } from 'react';
import { ActivityIndicator, Alert, Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { COLORS } from '../../app/theme';
import { useI18n } from '../../constants/i18n';

export function AccountModal({ visible, onClose, user, onSignIn, onSignUp, onSignOut }) {
  const { t } = useI18n();
  const [isRegistering, setIsRegistering] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const handleSignOut = async () => {
    if (signingOut) return;

    setSigningOut(true);
    try {
      await onSignOut();
      onClose();
    } catch (error) {
      Alert.alert(t('signOutError'), error.message);
    } finally {
      setSigningOut(false);
    }
  };

  const submit = async () => {
    if (!email.trim() || !password) {
      Alert.alert(t('error'), t('emailPasswordRequired'));
      return;
    }
    if (isRegistering && password !== confirmPassword) {
      Alert.alert(t('error'), t('passwordsMismatch'));
      return;
    }
    setLoading(true);
    try {
      const credentials = { email: email.trim(), password };
      if (isRegistering) {
        credentials.name = name.trim();
        credentials.password_confirmation = confirmPassword;
      }
      if (isRegistering) {
        const session = await onSignUp(credentials);
        Alert.alert(t('accountCreated'), session.message || t('verificationSent'));
        setIsRegistering(false);
        setEmail('');
        setName('');
      } else {
        await onSignIn(credentials);
      }
      setPassword('');
      setConfirmPassword('');
      if (!isRegistering) onClose();
    } catch (error) {
      Alert.alert(t('signInError'), error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title}>{user ? t('account').toUpperCase() : isRegistering ? t('createAccount') : t('signIn').toUpperCase()}</Text>
            <TouchableOpacity onPress={onClose} accessibilityLabel={t('closeAccount')}>
              <Text style={styles.close}>X</Text>
            </TouchableOpacity>
          </View>
          {user ? (
            <>
              <Text style={styles.welcome}>{user.name || user.email || t('connectedAccount')}</Text>
              <Text style={styles.description}>{t('accountMemoryAssociation')}</Text>
              <TouchableOpacity
                style={styles.submit}
                onPress={handleSignOut}
                disabled={signingOut}
                accessibilityRole="button"
                accessibilityLabel={t('signOut')}
              >
                {signingOut ? <ActivityIndicator color={COLORS.background} /> : <Text style={styles.submitText}>{t('signOut')}</Text>}
              </TouchableOpacity>
            </>
          ) : (
            <>
              {isRegistering && (
                <View>
                  <View style={styles.fieldLabelRow}>
                    <Text style={styles.fieldLabel}>{t('username')}</Text>
                    <TouchableOpacity
                      style={styles.infoButton}
                      onPress={() => Alert.alert(
                        t('usernameInfoTitle'),
                        t('usernameInfo'),
                      )}
                      accessibilityRole="button"
                      accessibilityLabel={t('usernameInfoAccessibility')}
                    >
                      <Text style={styles.infoText}>(i)</Text>
                    </TouchableOpacity>
                  </View>
                  <TextInput
                    style={styles.input}
                    placeholder={t('username')}
                    placeholderTextColor={COLORS.textMuted}
                    value={name}
                    onChangeText={setName}
                  />
                </View>
              )}
              <TextInput style={styles.input} placeholder={t('email')} placeholderTextColor={COLORS.textMuted} autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
              <TextInput style={styles.input} placeholder={t('password')} placeholderTextColor={COLORS.textMuted} secureTextEntry value={password} onChangeText={setPassword} />
              {isRegistering && (
                <TextInput
                  style={styles.input}
                  placeholder={t('confirmPassword')}
                  placeholderTextColor={COLORS.textMuted}
                  secureTextEntry
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                />
              )}
              <TouchableOpacity style={styles.submit} onPress={submit} disabled={loading}>
                {loading ? <ActivityIndicator color={COLORS.background} /> : <Text style={styles.submitText}>{isRegistering ? t('signUp').toUpperCase() : t('signIn').toUpperCase()}</Text>}
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  setIsRegistering((value) => !value);
                  setConfirmPassword('');
                }}
              >
                <Text style={styles.switchText}>{isRegistering ? t('alreadyHaveAccount') : t('signUp')}</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'center', padding: 20, backgroundColor: COLORS.overlay },
  container: { backgroundColor: COLORS.surfaceRaised, borderRadius: 16, padding: 20, borderWidth: 1, borderColor: COLORS.accent },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 },
  title: { color: COLORS.accent, fontSize: 18, fontWeight: 'bold', fontFamily: 'monospace' },
  close: { color: COLORS.text, fontWeight: 'bold', padding: 6 },
  welcome: { color: COLORS.text, fontSize: 16, fontWeight: 'bold', marginBottom: 8 },
  description: { color: COLORS.textMuted, marginBottom: 20 },
  fieldLabelRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  fieldLabel: { color: COLORS.text, fontSize: 13, fontFamily: 'monospace' },
  infoButton: { marginLeft: 6, paddingHorizontal: 4, paddingVertical: 1 },
  infoText: { color: COLORS.primary, fontSize: 13, fontWeight: 'bold' },
  input: { backgroundColor: COLORS.surfaceMuted, color: COLORS.text, borderRadius: 8, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: COLORS.border },
  submit: { backgroundColor: COLORS.accent, padding: 13, borderRadius: 8, alignItems: 'center', marginTop: 4 },
  submitText: { color: COLORS.background, fontWeight: 'bold', fontFamily: 'monospace' },
  switchText: { color: COLORS.text, textAlign: 'center', marginTop: 18 },
});
