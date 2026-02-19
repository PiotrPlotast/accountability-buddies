import { View, Text, Button } from "react-native";
import { Image } from "expo-image";

import { useSupabase } from "@/hooks/useSupabase";
export default function Profile() {
  const { signOut } = useSupabase();
  const blurhash =
    "|rF?hV%2WCj[ayj[a|j[az_NaeWBj@ayfRayfQfQM{M|azj[azf6fQfQfQIpWXofj[ayj[j[fQayWCoeoeaya}j[ayfQa{oLj?j[WVj[ayayj[fQoff7azayj[ayj[j[ayofayayayj[fQj[ayayj[ayfjj[j[ayjuayj[";

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (err) {
      console.error(JSON.stringify(err, null, 2));
    }
  };

  return (
    <View className="flex-1 items-center justify-center w-full">
      <View className="rounded-full overflow-hidden w-36 h-36 mb-4">
        <Image
          style={{ flex: 1, width: "100%", height: "100%" }}
          source={"https://picsum.photos/seed/696/3000/2000"}
          placeholder={blurhash}
        />
      </View>
      <Text className="text-lg font-medium">Piotr</Text>
      <Text className="text-lg font-medium">mail@gmail.com</Text>
      <Button title="Sign Out" onPress={handleSignOut}></Button>
    </View>
  );
}
