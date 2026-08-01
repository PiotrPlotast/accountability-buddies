import { useEffect } from "react";
import { Platform } from "react-native";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { QueryClient, useIsRestoring } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { StatusBar } from "expo-status-bar";
import { themeColors } from "@/lib/colors";
import {
  useFonts,
  GeistMono_400Regular,
  GeistMono_500Medium,
  GeistMono_700Bold,
} from "@expo-google-fonts/geist-mono";

import AsyncStorage from "@react-native-async-storage/async-storage";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";

import { useSupabase } from "@/hooks/useSupabase";
import { SupabaseProvider } from "@/providers/supabase-provider";
import { ThemeProvider } from "@/providers/theme-provider";

SplashScreen.setOptions({
  duration: 500,
  fade: true,
});

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: 1000 * 60 * 60 * 24, // 24 godziny
      staleTime: 1000 * 60 * 5, // 5 minut
    },
  },
});

const asyncStoragePersister = createAsyncStoragePersister({
  storage: AsyncStorage,
});

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    GeistMono_400Regular,
    GeistMono_500Medium,
    GeistMono_700Bold,
  });

  if (!fontsLoaded) return null;

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister: asyncStoragePersister }}
    >
      <StatusBar
        style="light"
        translucent={true}
        backgroundColor="transparent"
      />
      <SupabaseProvider>
        <ThemeProvider>
          <RootNavigator />
        </ThemeProvider>
      </SupabaseProvider>
      {Platform.OS === "web" && <ReactQueryDevtools initialIsOpen={false} />}
    </PersistQueryClientProvider>
  );
}

function RootNavigator() {
  const { isLoaded, session } = useSupabase();
  const isRestoring = useIsRestoring();
  const isAppReady = isLoaded && !isRestoring;
  useEffect(() => {
    if (isAppReady) {
      setTimeout(() => {
        SplashScreen.hideAsync();
      }, 50);
    }
  }, [isAppReady]);

  if (!isAppReady) {
    return null;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        gestureEnabled: false,
        animation: "none",
        animationDuration: 0,
        contentStyle: { backgroundColor: themeColors.background },
      }}
    >
      <Stack.Protected guard={!!session}>
        <Stack.Screen name="(protected)" />
      </Stack.Protected>

      <Stack.Protected guard={!session}>
        <Stack.Screen name="(public)" />
      </Stack.Protected>
    </Stack>
  );
}
