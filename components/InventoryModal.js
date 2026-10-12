/** Inventory UI for reviewing, clearing, and returning collected memories to AR. */
import React from 'react';
import {
  StyleSheet,
  Text,
  View,
  Modal,
  TouchableOpacity,
  FlatList,
  SafeAreaView
} from 'react-native';
import { COLORS } from '../app/theme';
import { useI18n } from '../constants/i18n';

export default function InventoryModal({ visible, onClose, items, onClear, onReplace }) {
  const { t } = useI18n();
  const renderItem = ({ item }) => (
    <View style={styles.itemCard}>
      <View style={styles.itemHeader}>
        <View style={styles.itemTitleBlock}>
          <Text style={styles.itemName}>{item.name || t('memoryUnknown')}</Text>
          {!!item.creatorName && <Text style={styles.creatorName}>{item.creatorName}</Text>}
        </View>
        <Text style={styles.itemDate}>
          {item.collectedAt ? new Date(item.collectedAt).toLocaleDateString() : t('anchored')}
        </Text>
      </View>

      <View style={styles.actionsRow}>
        {/* Button for returning the object to the real world. */}
        <TouchableOpacity
          style={styles.replaceButton}
          onPress={() => onReplace && onReplace(item)}
        >
          <Text style={styles.replaceButtonText}>📍 {t('replaceHere')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <Modal
      animationType="slide"
      transparent={true}
      visible={visible}
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          {/* Modal header. */}
          <View style={styles.topHeader}>
            <Text style={styles.title}>🎒 {t('collection').toUpperCase()} ({items.length})</Text>
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Collected objects list. */}
          {items.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>{t('emptyCollection')}</Text>
              <Text style={styles.emptySubtext}>
                {t('exploreCollection')}
              </Text>
            </View>
          ) : (
            <FlatList
              data={items}
              keyExtractor={(item, index) => `${item.id}-${index}`}
              renderItem={renderItem}
              contentContainerStyle={styles.listContainer}
            />
          )}

          {/* Footer with the clear button. */}
          {items.length > 0 && (
            <TouchableOpacity style={styles.clearButton} onPress={onClear}>
              <Text style={styles.clearButtonText}>{t('clearCollection')}</Text>
            </TouchableOpacity>
          )}
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: COLORS.overlayStrong,
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '80%',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  topHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingBottom: 15,
  },
  title: {
    color: COLORS.accent,
    fontSize: 16,
    fontWeight: 'bold',
    fontFamily: 'monospace',
  },
  closeButton: {
    backgroundColor: COLORS.transparentLight,
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    color: COLORS.text,
    fontWeight: 'bold',
  },
  listContainer: {
    paddingBottom: 10,
  },
  itemCard: {
    backgroundColor: COLORS.surfaceRaised,
    borderRadius: 10,
    padding: 15,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  itemName: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: 'bold',
    fontFamily: 'monospace',
  },
  itemTitleBlock: {
    flex: 1,
    marginRight: 10,
  },
  creatorName: {
    color: COLORS.primary,
    fontSize: 11,
    marginTop: 4,
    fontFamily: 'monospace',
  },
  itemDate: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontFamily: 'monospace',
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 5,
  },
  replaceButton: {
    backgroundColor: COLORS.primaryStrong,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
  },
  replaceButtonText: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: 'bold',
    fontFamily: 'monospace',
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    color: COLORS.accent,
    fontSize: 16,
    fontFamily: 'monospace',
    marginBottom: 8,
  },
  emptySubtext: {
    color: COLORS.textSubtle,
    fontSize: 12,
    fontFamily: 'monospace',
    textAlign: 'center',
  },
  clearButton: {
    marginTop: 10,
    paddingVertical: 12,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  clearButtonText: {
    color: COLORS.danger,
    fontSize: 12,
    fontFamily: 'monospace',
  },
});