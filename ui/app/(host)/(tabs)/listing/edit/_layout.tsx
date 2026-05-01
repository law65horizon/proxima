import { Stack } from "expo-router";

export default function Create_Edit_Property() {
    return (
        <Stack>
            <Stack.Screen name='basic_info' options={{headerShown: false, }}/>
            <Stack.Screen name='location' options={{headerShown: false, }}/>
            <Stack.Screen name='description_amenities' options={{headerShown: false, }}/>
            <Stack.Screen name='photos' options={{headerShown: false, }}/>
            <Stack.Screen name='pricing' options={{headerShown: false, }}/>
            <Stack.Screen name='review' options={{headerShown: false, }}/>
        </Stack>
    )
}