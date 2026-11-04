import { useRef } from "react";
import { Platform, Text, View } from "react-native";
import * as AppleAuthentication from "expo-apple-authentication";

import { useAppleSignIn } from "@/hooks/useAppleSignIn";
import { getAuthErrorMessage } from "@/lib/authErrors";

type Props = {
  /**
   * Reported up so the failure lands on the screen's existing `FormError`
   * rather than opening a second error region under the same form.
   */
  onError: (message: string | null) => void;
  buttonType?: AppleAuthentication.AppleAuthenticationButtonType;
};

/**
 * The "or / Sign in with Apple" block, below the email form on both auth
 * screens. `welcome.tsx` is untouched: the cost is one extra tap for an Apple
 * user, who opens a form screen to find the option that skips forms, and it
 * buys the layout people already recognise.
 *
 * Renders nothing off iOS — `expo-apple-authentication` is iOS-only, and an
 * "or" divider with nothing under it is worse than no divider. A synchronous
 * `Platform` check rather than `isAvailableAsync()`: that call adds the state
 * and the effect to hold its answer, and it can only ever say "no" below
 * iOS 13, five majors under SDK 57's floor.
 */
export default function AppleAuth({ onError, buttonType }: Props) {
  const { signInWithApple } = useAppleSignIn();
  // A ref, not state: two taps can land in the same frame, before React
  // re-renders, and a guard kept in state reads the old `false` for both and
  // opens two Apple sheets. A ref is set by the first tap and seen by the
  // second at once.
  const inFlight = useRef(false);

  if (Platform.OS !== "ios") return null;

  const onPress = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    onError(null);
    try {
      await signInWithApple();
      // A cancelled sheet resolves here too, having done nothing. On real
      // success the session guard unmounts this screen.
    } catch (err) {
      onError(getAuthErrorMessage(err));
    } finally {
      // Lifted however the attempt ended, so it can be tried again at once.
      inFlight.current = false;
    }
  };

  return (
    <View className="gap-4 mt-2">
      <View className="flex-row items-center gap-3">
        <View className="flex-1 h-px bg-border" />
        <Text className="text-text-dim font-mono text-xs">or</Text>
        <View className="flex-1 h-px bg-border" />
      </View>

      <AppleAuthentication.AppleAuthenticationButton
        buttonType={
          buttonType ??
          AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN
        }
        // White reads as the second option against the near-black ground
        // without competing with the accent-filled Continue button above it.
        buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
        // Matches Tailwind's `rounded-tile`, which every other control uses.
        cornerRadius={14}
        style={{ height: 56 }}
        onPress={onPress}
      />
    </View>
  );
}
