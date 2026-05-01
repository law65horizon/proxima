// SignInScreen.js
import { ThemedText } from '@/components/ThemedText';
import FormField from '@/components/ui/FormField';
import { LOGIN, SEND_VERIFICATION_CODE, VERIFY_CODE } from '@/graphql/mutations';
import { useAuthStore } from '@/stores/authStore';
import { useTheme } from '@/theme/theme';
import { useMutation } from '@apollo/client';
import { router, useNavigation } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { OtpInput } from 'react-native-otp-entry';

interface FormErrors {
  email?: string
}

export default function SignInScreen() {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [step, setStep] = useState<'details' | 'code'>('details');
  const [code, setCode] = useState('');
  const navigation = useNavigation() 
  const {theme} = useTheme()
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({
    email: '',
    password: '',
  })
  const [touched, setTouched] = useState({
    email: false,
  });
  const { setAuth } = useAuthStore();
  

  const [login, {loading: loginIn, error: loginError}] = useMutation(LOGIN)
  const [sendCode, { loading: sendingCode }] = useMutation(SEND_VERIFICATION_CODE);
  const [verifyCode, { loading: verifying }] = useMutation(VERIFY_CODE);

  const validateForm = useCallback((): FormErrors => {
    const errors:FormErrors = {}

    if (!form.email.trim()) {
      errors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      errors.email = 'Invalid email format';
    }

    return errors;
  }, [form])

  const errors = validateForm()

  const onSubmit = async () => {
    setTouched({ email: true });

    const errors = validateForm()
    if (Object.keys(errors).length > 0) {
      Alert.alert('Validation Error', Object.values(errors).join('/n'))
      return;
    }

    try {
      setIsSubmitting(true)
      const {data} = await login({
        variables: {
          email: form.email.toLocaleLowerCase().trim(),
          password: form.password.trim(),
          deviceInfo: 'sisoi'
        }
      })

      if (data.login.success) {
        await handleSendCode()
      }
    } catch (error) {
      
    } finally {
      setIsSubmitting(false)
    }
  };

  const handleSendCode = useCallback(async () => {
      console.log('wowo')
      
      try {
        const { data } = await sendCode({
          variables: { email: form.email.toLocaleLowerCase().trim() },
        });
  
        if (data.sendVerificationCode.success) {
          setStep('code');
          Alert.alert('Success', data.sendVerificationCode.message);
  
          if (__DEV__ && data.sendVerificationCode.previewUrl) {
            console.log('Email Preview:', data.sendVerificationCode.previewUrl);
          }
        }
      } catch (error: any) {
        Alert.alert('Error', error.message || 'Something went wrong');
      }
    }, [form, sendCode, validateForm]);
  
    const handleVerifyCode = useCallback(async () => {
      if (code.length !== 6) {
        Alert.alert('Error', 'Please enter the 6-digit code');
        return;
      }
  
      try {
        const { data } = await verifyCode({
          variables: {
            input: {
              email: form.email.toLowerCase().trim(),
              code,
              // firstName: form.firstName.trim(),
              // lastName: form.lastName.trim(),
              // dob: form.dob?.toISOString() ?? null,
              // phone: form.phone.trim(),
            },
          },
        });

        console.log({userm: data?.verifyCode.user})
  
        await setAuth(
          data.verifyCode.accessToken,
          data.verifyCode.refreshToken,
          data.verifyCode.user,
          data.verifyCode.sessionId,
          data.verifyCode.user.role || 'guest'
        );
  
        router.dismissAll();
      } catch (error: any) {
        Alert.alert('Error', error.message || 'Verification failed');
        setCode('');
      }
    }, [code, form, setAuth, verifyCode]);

  if (step === 'code') {
      return (
        <View style={[styles.container, { backgroundColor: theme.colors.background, paddingTop: 20, paddingHorizontal: 20 }]}>
          <ThemedText type='subtitle' >
              Enter Verification Code
            </ThemedText>
            
            <ThemedText type='body' style={{marginVertical: 10}}>
              We sent a verification code to{'\n'}
              <ThemedText style={{ fontWeight: '600' }}>{form.email}</ThemedText>
            </ThemedText>
          <View style={styles.codeContainer}>        
            <OtpInput
              numberOfDigits={6}
              onTextChange={setCode}
              theme={{
          pinCodeContainerStyle: {
                  width: 48,
                  height: 56,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  backgroundColor: theme.colors.backgroundInput,
                },
                pinCodeTextStyle: {
                  fontSize: 24,
                  fontWeight: '600',
                  color: theme.colors.text,
                },
                focusedPinCodeContainerStyle: {
                  borderColor: theme.colors.primary,
                  borderWidth: 2,
                },
              }}
            />
  
            <Text style={[styles.helperText, { color: theme.colors.textSecondary }]}>
              Didn't receive the code?{' '}
              <Text 
                style={[styles.linkText, { color: theme.colors.primary }]}
                onPress={handleSendCode}
              >
                {sendingCode ? 'Sending...' : 'Resend'}
              </Text>
            </Text>
            
            <TouchableOpacity
              style={[
                styles.button,
                { backgroundColor: theme.colors.primary, justifyContent: 'flex-end' },
                (verifying || code.length !== 6) && styles.buttonDisabled,
              ]}
              onPress={handleVerifyCode}
              disabled={verifying || code.length !== 6}
            >
              {verifying ? (
                <ActivityIndicator animating={verifying} color={theme.colors.buttonText} />
              ) : (
                <Text style={[styles.buttonText, { color: theme.colors.buttonText }]}>
                  Verify & Continue
                </Text>
              )}
            </TouchableOpacity>
            
            <TouchableOpacity onPress={() => alert('Change email')} style={styles.backButton}>
              <Text style={[styles.linkText, { color: theme.colors.primary }]}>
                Change Email
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )
    }

  return (
    // <View style={styles.container}>
      <ScrollView style={{backgroundColor: theme.colors.backgroundSec}} contentContainerStyle={styles.inner}>
        {/* Header */}
        <View style={[styles.header,]}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <ThemedText style={styles.backArrow}>‹</ThemedText>
          </TouchableOpacity>
          <View style={{flex: 1, alignItems: 'center'}}>
            <ThemedText style={styles.title}>Finish signing In</ThemedText>
          </View>
        </View>
        
        <FormField 
          title='Email'
          style={[
            styles.input ,
            touched && errors.email ? styles.errorBorder: null   
          ]}
          keyboardType='email-address'
          value={form.email}
          onChangeText={(text) => setForm({...form, email: text})}
          onBlur={() => setTouched((t) => ({...t, email: true}))}
          textContentType='username'
          autoComplete='username'
          autoCapitalize='none'
          autoCorrect={false}
        />
        {touched.email && errors.email ? (
          <Text style={styles.errorText}>{errors.email}</Text>
        ) : null} 


        <FormField
          type='password' 
          title='Password'
          style={[
            styles.input ,
            errors.email ? styles.errorBorder: null   
          ]}
          value={form.password}
          onChangeText={v => {
            setForm({...form, password: v});
            if (touched.email) setTouched(t => ({ ...t, email: true }));
          }}
          showPassword={showPassword}
          switchShowPassword={() => setShowPassword(!showPassword)}
          autoComplete='password'
          textContentType='password'
          accessibilityLabel=''
        />
        
        {loginError && <Text style={[styles.errorText, {fontSize: 14}]}>{loginError.message}</Text>}

        <TouchableOpacity
            style={[styles.button, { backgroundColor: theme.colors.primary }]}
            onPress={onSubmit}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <ActivityIndicator animating={isSubmitting}  color={theme.colors.buttonText ?? '#FFFFFF'} />
            ) : (
              <ThemedText type="defaultSemiBold" style={{ color: theme.colors.buttonText ?? '#FFFFFF' }}>
                Agree and continue
              </ThemedText>
            )}
          </TouchableOpacity>

        {/* Footer */}
        <Text style={styles.footer}>
          Airbnb will send you members-only deals, inspiration, marketing emails,
          and push notifications. You can opt out of receiving these at any time in
          your account settings or directly from the messages.
        </Text>
        {/* </View> */}
      </ScrollView>
    // </View>
  );
}

const styles = StyleSheet.create({
  buttonDisabled: { opacity: 0.6 },
  backButton: { marginTop: 30 },
  helperText: {
    fontSize: 14,
    marginTop: 20,
    marginBottom: 32,
  },
  linkText: {
    fontWeight: '600',
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  codeContainer: { flex: 1, },
  container: { flex: 1, backgroundColor: '#fff' },
  inner: { padding: 16, paddingBottom: 40, },
  header: { flexDirection: 'row', alignItems: 'center' },
  backArrow: { fontSize: 28, marginRight: 8 },
  title: { fontSize: 20, fontWeight: '600' },
  label: { fontSize: 16, fontWeight: '500', marginTop: 24 },
  smallLabel: { fontSize: 12, color: '#555', marginBottom: 4 },
  nameRow: { flexDirection: 'row', justifyContent: 'space-between' },
  nameField: { flex: 1, marginRight: 8 },
  input: {
    flex: 1,
    borderWidth: 0,
    // borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontSize: 16,
  },
  pickerButton: {
    borderWidth: 1,
    borderColor: '#CCC',
    borderRadius: 6,
    paddingVertical: 12,
    paddingHorizontal: 12,
    justifyContent: 'center',
    backgroundColor: '#FAFAFA',
  },
  pickerText: { fontSize: 16, color: '#000' },
  pickerPlaceholder: { fontSize: 16, color: '#999' },
  hint: { fontSize: 12, color: '#555', marginTop: 8 },
  link: { color: '#007aff' },
  errorText: { color: '#D32F2F', fontSize: 12, marginTop: 4 },
  errorBorder: { borderColor: '#EF4444' },
  terms: { fontSize: 12, color: '#555', marginTop: 32, lineHeight: 18 },
  button: {
    marginTop: 24,
    // backgroundColor: '#000',
    borderRadius: 6,
    paddingVertical: 14,
    alignItems: 'center',
  },
  // buttonText: { color: '#FFF', fontSize: 16, fontWeight: '600' },
  footer: { fontSize: 12, color: '#777', marginTop: 24, lineHeight: 18 },
});
