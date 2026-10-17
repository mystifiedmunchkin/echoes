/** Player history and ranked scores; the preferences tab remains a placeholder. */
import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Modal,
  TouchableOpacity,
  FlatList,
  SafeAreaView,
} from 'react-native';
import { COLORS } from '../../theme';
import { useI18n } from '../../constants/i18n';

const TABS = [
  { id: 'places', labelKey: 'menuPlaces' },
  { id: 'preferences', labelKey: 'menuPreferences' },
  { id: 'scores', labelKey: 'menuScores' },
];

const PlaceSeparator = () => <View style={styles.separator} />;

export default function MenuModal({
  visible,
  onClose,
  places,
  scores,
  onSelectPlace,
}) {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState('places');

  const renderPlace = ({ item }) => (
    <TouchableOpacity
      style={styles.placeRow}
      onPress={() => onSelectPlace && onSelectPlace(item)}
      accessibilityRole="button"
    >
      <View style={[styles.statusDot, item.isDone && styles.statusDotDone]} />
      <Text style={styles.placeName} numberOfLines={1}>
        {item.name || t('memoryUnknown')}
      </Text>
      <Text style={[styles.placeStatus, item.isDone && styles.placeStatusDone]}>
        {item.isDone ? t('placeStatusDone') : t('placeStatusInProgress')}
      </Text>
      <Text style={styles.placeDate}>
        {item.lastSeenAt ? new Date(item.lastSeenAt).toLocaleDateString() : ''}
      </Text>
    </TouchableOpacity>
  );

  const renderContent = () => {
    if (activeTab === 'scores') {
      if (!scores || scores.length === 0) {
        return (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>{t('noScores')}</Text>
          </View>
        );
      }
      return (
        <FlatList
          data={[...scores].sort((a, b) => b.points - a.points)}
          keyExtractor={item => `${item.location_id}:${item.gameType || 'aiming'}`}
          renderItem={({ item, index }) => (
            <View style={styles.scoreRow}>
              <Text style={styles.scoreRank}>{index + 1}.</Text>
              <Text style={styles.placeName} numberOfLines={1}>
                {item.name || t('memoryUnknown')}
                {item.gameType ? ` — ${t(`experience_${item.gameType}`)}` : ''}
              </Text>
              <Text style={styles.scoreValue}>{item.points}</Text>
            </View>
          )}
          ItemSeparatorComponent={PlaceSeparator}
          contentContainerStyle={styles.listContainer}
        />
      );
    }
    if (activeTab !== 'places') {
      return (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptySubtext}>{t('comingSoon')}</Text>
        </View>
      );
    }
    if (places.length === 0) {
      return (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>{t('noVisitedPlaces')}</Text>
          <Text style={styles.emptySubtext}>{t('exploreVisitedPlaces')}</Text>
        </View>
      );
    }
    return (
      <FlatList
        data={places}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderPlace}
        ItemSeparatorComponent={PlaceSeparator}
        contentContainerStyle={styles.listContainer}
      />
    );
  };

  return (
    <Modal
      animationType="slide"
      transparent={true}
      visible={visible}
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.topHeader}>
            <Text style={styles.title}>{t('menu').toUpperCase()}</Text>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel={t('closeMenu')}
            >
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.tabs}>
            {TABS.map((tab) => (
              <TouchableOpacity
                key={tab.id}
                style={[styles.tab, activeTab === tab.id && styles.tabActive]}
                onPress={() => setActiveTab(tab.id)}
                accessibilityRole="tab"
                accessibilityState={{ selected: activeTab === tab.id }}
              >
                <Text style={[styles.tabText, activeTab === tab.id && styles.tabTextActive]}>
                  {t(tab.labelKey)}
                  {tab.id === 'places' ? ` (${places.length})` : ''}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {renderContent()}
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
    height: '80%',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  topHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
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
  tabs: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    marginBottom: 8,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: COLORS.transparent,
  },
  tabActive: {
    borderBottomColor: COLORS.accent,
  },
  tabText: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontFamily: 'monospace',
  },
  tabTextActive: {
    color: COLORS.accent,
    fontWeight: 'bold',
  },
  listContainer: {
    paddingBottom: 10,
  },
  placeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 36,
    paddingVertical: 6,
    paddingHorizontal: 4,
    gap: 8,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: COLORS.border,
    opacity: 0.4,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.accent,
  },
  statusDotDone: {
    backgroundColor: COLORS.primary,
  },
  placeName: {
    flex: 1,
    color: COLORS.text,
    fontSize: 13,
    fontFamily: 'monospace',
  },
  placeStatus: {
    color: COLORS.accent,
    fontSize: 10,
    fontFamily: 'monospace',
  },
  placeStatusDone: {
    color: COLORS.primary,
  },
  placeDate: {
    color: COLORS.textMuted,
    fontSize: 10,
    fontFamily: 'monospace',
    minWidth: 70,
    textAlign: 'right',
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 36,
    paddingVertical: 6,
    paddingHorizontal: 4,
    gap: 8,
  },
  scoreRank: {
    color: COLORS.textMuted,
    fontSize: 13,
    fontFamily: 'monospace',
    width: 24,
  },
  scoreValue: {
    color: COLORS.accent,
    fontSize: 16,
    fontWeight: 'bold',
    fontFamily: 'monospace',
    minWidth: 36,
    textAlign: 'right',
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    color: COLORS.accent,
    fontSize: 14,
    fontFamily: 'monospace',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtext: {
    color: COLORS.textSubtle,
    fontSize: 12,
    fontFamily: 'monospace',
    textAlign: 'center',
  },
});
