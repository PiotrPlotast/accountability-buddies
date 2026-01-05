import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Keyboard,
} from "react-native";

type Props = {
  onAdd: (title: string) => Promise<void>;
};

export default function AddGoalInput({ onAdd }: Props) {
  const [title, setTitle] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!title.trim()) return;

    setIsSubmitting(true);

    await onAdd(title);

    setTitle("");
    setIsSubmitting(false);
    Keyboard.dismiss();
  };

  return (
    <View className="flex-row gap-2 mb-4">
      <TextInput
        placeholder="+ Add a new habit..."
        value={title}
        onChangeText={setTitle}
        onSubmitEditing={handleSubmit}
        className="flex-1 bg-gray-50 border border-gray-200 p-4 rounded-xl text-base"
        editable={!isSubmitting}
      />

      {title.length > 0 && (
        <TouchableOpacity
          onPress={handleSubmit}
          disabled={isSubmitting}
          className="bg-slate-900 justify-center px-5 rounded-xl"
        >
          <Text className="text-white font-bold">
            {isSubmitting ? "..." : "Add"}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
