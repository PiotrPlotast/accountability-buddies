import React, { useState, useEffect } from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Goal } from "@/types/dashboardTypes";
import { useDashboardActions } from "@/hooks/useDashboardActions";
import { useDashboardData } from "@/hooks/useDashboardData";

type Props = {
  goal: Goal | null;
  isVisible: boolean;
  onClose: () => void;
};

export default function EditGoalModal({ goal, isVisible, onClose }: Props) {
  const { activeGroupId } = useDashboardData();
  const { editGoal } = useDashboardActions(activeGroupId);
  const [title, setTitle] = useState("");

  useEffect(() => {
    if (goal) setTitle(goal.title);
  }, [goal]);

  return (
    <Modal visible={isVisible} animationType="fade" transparent>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.7)",
          justifyContent: "center",
          padding: 20,
        }}
      >
        <View className="bg-surface border border-border rounded-tile p-6">
          <Text className="text-text-muted font-mono uppercase text-xs tracking-widest mb-3">
            Edit habit
          </Text>
          <View className="border border-border rounded-tile px-4 h-14 justify-center bg-bg mb-4">
            <TextInput
              value={title}
              onChangeText={setTitle}
              autoFocus
              placeholder="Habit name"
              placeholderTextColor="#6B7280"
              className="text-text font-mono text-base"
              style={{ fontFamily: "GeistMono_400Regular" }}
            />
          </View>
          <View className="flex-row gap-3">
            <Pressable
              onPress={onClose}
              className="flex-1 h-12 rounded-tile items-center justify-center bg-bg border border-border"
            >
              <Text className="text-text-muted font-mono-medium">Cancel</Text>
            </Pressable>
            <Pressable
              className="flex-1 h-12 rounded-tile items-center justify-center bg-neon"
              onPress={async () => {
                if (goal?.id) {
                  await editGoal(goal.id, title);
                  onClose();
                }
              }}
            >
              <Text className="text-bg font-mono-bold">Save</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
