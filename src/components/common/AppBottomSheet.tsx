import React, { useCallback, useMemo, forwardRef } from "react";
import { View, Text, Pressable } from "react-native";
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetView,
  type BottomSheetBackdropProps,
} from "@gorhom/bottom-sheet";
import type { BottomSheetMethods } from "@gorhom/bottom-sheet/lib/typescript/types";
import { Ionicons } from "@expo/vector-icons";
import { useThemeColors } from "../../hooks/useThemeColors";

interface AppBottomSheetProps {
  title?: string;
  snapPoints?: (string | number)[];
  children: React.ReactNode;
  onClose?: () => void;
  enableDynamicSizing?: boolean;
}

export const AppBottomSheet = forwardRef<BottomSheetMethods, AppBottomSheetProps>(
  ({ title, snapPoints: customSnapPoints, children, onClose, enableDynamicSizing = false }, ref) => {
    const snapPoints = useMemo(() => customSnapPoints ?? ["40%", "70%"], [customSnapPoints]);
    const colors = useThemeColors();

    const renderBackdrop = useCallback(
      (props: BottomSheetBackdropProps) => (
        <BottomSheetBackdrop
          {...props}
          disappearsOnIndex={-1}
          appearsOnIndex={0}
          opacity={0.4}
        />
      ),
      [],
    );

    return (
      <BottomSheet
        ref={ref}
        index={-1}
        snapPoints={enableDynamicSizing ? undefined : snapPoints}
        enableDynamicSizing={enableDynamicSizing}
        enablePanDownToClose
        backdropComponent={renderBackdrop}
        onClose={onClose}
        handleIndicatorStyle={{ backgroundColor: colors.chevron, width: 36 }}
        backgroundStyle={{ backgroundColor: colors.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20 }}
      >
        <BottomSheetView style={{ flex: enableDynamicSizing ? 0 : 1 }}>
          {title && (
            <View className="flex-row items-center justify-between border-b border-border-light px-4 pb-3">
              <Text className="text-lg font-semibold text-text-main">{title}</Text>
              {onClose && (
                <Pressable onPress={onClose} hitSlop={8} className="active:opacity-60">
                  <Ionicons name="close" size={20} color={colors.searchIcon} />
                </Pressable>
              )}
            </View>
          )}
          <View className="px-4 py-3">{children}</View>
        </BottomSheetView>
      </BottomSheet>
    );
  },
);

AppBottomSheet.displayName = "AppBottomSheet";
