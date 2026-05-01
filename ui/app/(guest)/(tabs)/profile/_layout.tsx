import { Stack } from "expo-router";

const ProfileLayout = () => {
    return (
        <Stack>
            <Stack.Screen name="index" options={{headerShown: false}} />
            <Stack.Screen name="help" options={{headerShown: false}} />
            <Stack.Screen name="legal" options={{headerShown: false}} />
            <Stack.Screen name="unboardagent" options={{headerShown: false}} />
        </Stack>
    )
}

export default ProfileLayout