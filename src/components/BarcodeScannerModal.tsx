import React, { useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  CameraView,
  useCameraPermissions,
  type BarcodeScanningResult,
} from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLarder } from '@/db/LarderContext';
import {
  lookupBarcodeProduct,
  type BarcodeLookupResult,
} from '@/services/barcodeService';
import type { ThemeColors } from '@/theme/colors';
import { hapticMedium, hapticSelection } from '@/utils/haptics';

interface BarcodeScannerModalProps {
  visible: boolean;
  onClose: () => void;
  onResult: (result: BarcodeLookupResult) => void;
}

function BarcodeScannerContent({
  onClose,
  onResult,
}: {
  onClose: () => void;
  onResult: (result: BarcodeLookupResult) => void;
}) {
  const { colors, language, t } = useLarder();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [permission, requestPermission] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);
  const lockedRef = useRef(false);

  const handleScanned = async (scan: BarcodeScanningResult) => {
    if (lockedRef.current || !scan.data) return;
    lockedRef.current = true;
    hapticMedium();
    setLookingUp(true);
    try {
      const result = await lookupBarcodeProduct(scan.data, language);
      onResult(result);
      onClose();
    } finally {
      setLookingUp(false);
      lockedRef.current = false;
    }
  };

  return (
    <View style={styles.root}>
      {!permission?.granted ? (
        <View style={[styles.permWrap, { paddingTop: Math.max(insets.top, 20) }]}>
          <Pressable
            onPress={onClose}
            style={[styles.permClose, { top: Math.max(insets.top, 16) + 8 }]}
          >
            <Ionicons name="close" size={22} color={colors.text} />
          </Pressable>
          <View style={styles.permCard}>
            <Ionicons name="barcode-outline" size={44} color={colors.primary} />
            <Text style={styles.permTitle}>{t.scanBarcodeTitle}</Text>
            <Text style={styles.permDesc}>{t.scanPermissionNeeded}</Text>
            <Pressable
              onPress={() => requestPermission()}
              style={styles.permBtn}
            >
              <Text style={styles.permBtnText}>{t.grantCameraBtn}</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={styles.cameraContainer}>
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            enableTorch={torch}
            barcodeScannerSettings={{
              barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128'],
            }}
            onBarcodeScanned={lookingUp ? undefined : handleScanned}
          />

          <View
            style={[
              styles.topBar,
              { paddingTop: Math.max(insets.top, 16) + 6 },
            ]}
          >
            <Pressable onPress={onClose} style={styles.overlayBtn}>
              <Ionicons name="close" size={22} color="#FFFFFF" />
            </Pressable>
            <Text style={styles.cameraTitle}>{t.scanBarcodeTitle}</Text>
            <Pressable
              onPress={() => {
                hapticSelection();
                setTorch((v) => !v);
              }}
              style={[styles.overlayBtn, torch && { backgroundColor: colors.primary }]}
            >
              <Ionicons
                name={torch ? 'flash' : 'flash-outline'}
                size={20}
                color="#FFFFFF"
              />
            </Pressable>
          </View>

          <View style={styles.reticleWrap} pointerEvents="none">
            <View style={styles.reticle} />
            <View style={styles.hintPill}>
              {lookingUp ? (
                <>
                  <ActivityIndicator size="small" color="#FFFFFF" />
                  <Text style={styles.hintText}>{t.scanLookingUp}</Text>
                </>
              ) : (
                <Text style={styles.hintText}>{t.scanBarcodeHint}</Text>
              )}
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

export function BarcodeScannerModal({
  visible,
  onClose,
  onResult,
}: BarcodeScannerModalProps) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      {visible ? (
        <BarcodeScannerContent onClose={onClose} onResult={onResult} />
      ) : null}
    </Modal>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: '#000000',
    },
    permWrap: {
      flex: 1,
      backgroundColor: c.bg,
      paddingHorizontal: 24,
      justifyContent: 'center',
    },
    permClose: {
      position: 'absolute',
      top: 52,
      right: 20,
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: c.surfaceAlt,
      alignItems: 'center',
      justifyContent: 'center',
    },
    permCard: {
      backgroundColor: c.surface,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: c.border,
      padding: 24,
      alignItems: 'center',
      gap: 12,
    },
    permTitle: {
      fontSize: 20,
      fontWeight: '700',
      color: c.text,
    },
    permDesc: {
      fontSize: 14,
      lineHeight: 20,
      color: c.textSecondary,
      textAlign: 'center',
    },
    permBtn: {
      marginTop: 6,
      paddingHorizontal: 22,
      paddingVertical: 12,
      borderRadius: 12,
      backgroundColor: c.primary,
    },
    permBtnText: {
      fontSize: 15,
      fontWeight: '700',
      color: c.white,
    },
    cameraContainer: {
      flex: 1,
    },
    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 18,
    },
    overlayBtn: {
      width: 42,
      height: 42,
      borderRadius: 21,
      backgroundColor: 'rgba(0,0,0,0.55)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    cameraTitle: {
      fontSize: 17,
      fontWeight: '700',
      color: '#FFFFFF',
    },
    reticleWrap: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 18,
    },
    reticle: {
      width: 260,
      height: 155,
      borderRadius: 18,
      borderWidth: 2.5,
      borderColor: '#FFFFFF',
      backgroundColor: 'rgba(255,255,255,0.06)',
    },
    hintPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: 'rgba(0,0,0,0.68)',
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 999,
    },
    hintText: {
      fontSize: 14,
      fontWeight: '600',
      color: '#FFFFFF',
    },
  });
