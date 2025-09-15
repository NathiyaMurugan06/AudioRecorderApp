import { Audio } from "expo-av";
import { useEffect, useRef, useState } from "react";
import { Alert, AppState, StyleSheet, Text, TouchableOpacity, View } from "react-native";

// Default export React component (suitable as App.js)
export default function App() {
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [recording, setRecording] = useState(null);
  const [recordingStatus, setRecordingStatus] = useState(null);
  const [sound, setSound] = useState(null);
  const [savedUri, setSavedUri] = useState(null);
  const [isPausedByUser, setIsPausedByUser] = useState(false);
  const [isPausedByInterruption, setIsPausedByInterruption] = useState(false);

  const appState = useRef(AppState.currentState);
  const recordingRef = useRef(null);

  useEffect(() => {
    (async () => {
      // Configure audio mode to allow recording + background
      try {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          interruptionModeIOS: Audio.INTERRUPTION_MODE_IOS_DO_NOT_MIX,
          playsInSilentModeIOS: true,
          staysActiveInBackground: true, // important for background recording
          interruptionModeAndroid: Audio.INTERRUPTION_MODE_ANDROID_DO_NOT_MIX,
          shouldDuckAndroid: false,
          playThroughEarpieceAndroid: false,
        });
      } catch (e) {
        console.warn("Audio mode set failed:", e);
      }

      const { granted } = await Audio.requestPermissionsAsync();
      setPermissionGranted(granted);
      if (!granted) Alert.alert("Permission required", "Microphone permission is required to record audio.");
    })();

    const appStateSub = AppState.addEventListener("change", _handleAppStateChange);

    return () => {
      appStateSub.remove();
      if (sound) {
        sound.unloadAsync();
      }
    };
  }, []);

  useEffect(() => {
    // keep ref in sync
    recordingRef.current = recording;
  }, [recording]);

  // Recording status update callback — used to detect interruptions
  const onRecordingStatusUpdate = (status) => {
    setRecordingStatus(status);

    // If something external stopped recording (for example phone call), detect it
    if (recordingRef.current) {
      // If it was previously recording and now not recording and not paused by user
      if (status.isRecording === false && !isPausedByUser && !isPausedByInterruption) {
        // If still canRecord is false or duration didn't advance, assume interruption
        setIsPausedByInterruption(true);
        console.log("Recording paused by interruption");
      }

      // If we previously marked paused by interruption and recording resumed (status.isRecording true)
      if (isPausedByInterruption && status.isRecording === true) {
        setIsPausedByInterruption(false);
        console.log("Recording resumed after interruption (system resumed recording)");
      }
    }
  };

  const _handleAppStateChange = (nextAppState) => {
    // App moved between foreground/background
    // We want recording to continue in background, so we do NOT pause on background
    // But we keep track of state for debugging and possible UI changes
    if (appState.current.match(/inactive|background/) && nextAppState === "active") {
      console.log("App has come to the foreground!");
    }
    appState.current = nextAppState;
  };

  const startRecording = async () => {
    if (!permissionGranted) {
      Alert.alert("Permission missing", "Please allow microphone permission in settings.");
      return;
    }

    try {
      // If a previous sound is loaded, unload it
      if (sound) {
        await sound.unloadAsync();
        setSound(null);
      }

      // Create new recording instance
      const rec = new Audio.Recording();
      await rec.prepareToRecordAsync(Audio.RECORDING_OPTIONS_PRESET_HIGH_QUALITY);

      rec.setOnRecordingStatusUpdate(onRecordingStatusUpdate);
      await rec.startAsync();

      setRecording(rec);
      setIsPausedByUser(false);
      setIsPausedByInterruption(false);
      setSavedUri(null);
      console.log("Recording started");
    } catch (err) {
      console.error("Failed to start recording", err);
      Alert.alert("Recording error", String(err));
    }
  };

  const pauseRecording = async () => {
    if (!recording) return;
    try {
      await recording.pauseAsync();
      setIsPausedByUser(true);
      console.log("Recording paused by user");
    } catch (e) {
      console.warn("Pause failed", e);
    }
  };

  const resumeRecording = async () => {
    if (!recording) return;
    try {
      await recording.startAsync(); // resume
      setIsPausedByUser(false);
      setIsPausedByInterruption(false);
      console.log("Recording resumed by user");
    } catch (e) {
      console.warn("Resume failed", e);
    }
  };

  const stopRecording = async () => {
    if (!recording) return;
    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      setSavedUri(uri);
      setRecording(null);
      setIsPausedByUser(false);
      setIsPausedByInterruption(false);
      console.log("Recording stopped and saved to:", uri);
      Alert.alert("Saved", `Recording saved to: ${uri}`);
    } catch (e) {
      console.warn("Stop failed", e);
    }
  };

  const playRecording = async () => {
    if (!savedUri) {
      Alert.alert("No recording", "Please record something first.");
      return;
    }
    try {
      // Unload old sound
      if (sound) {
        try {
          await sound.unloadAsync();
        } catch (e) {
          console.warn("Unload failed", e);
        }
      }

      const { sound: newSound } = await Audio.Sound.createAsync({ uri: savedUri }, { shouldPlay: true });
      setSound(newSound);

      newSound.setOnPlaybackStatusUpdate((st) => {
        if (st.didJustFinish) {
          // optionally unload when finished
          // newSound.unloadAsync();
        }
      });
    } catch (e) {
      console.warn("Playback failed", e);
    }
  };

  const formatMillis = (millis) => {
    if (!millis && millis !== 0) return "00:00";
    const totalSeconds = Math.floor(millis / 1000);
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Audio Recorder (Expo)</Text>

      <View style={styles.row}>
        <TouchableOpacity style={styles.btn} onPress={startRecording} disabled={!!recording}>
          <Text style={styles.btnText}>Start</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.btn} onPress={pauseRecording} disabled={!recording || (recordingStatus && !recordingStatus.isRecording)}>
          <Text style={styles.btnText}>Pause</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.btn} onPress={resumeRecording} disabled={!recording || (recordingStatus && recordingStatus.isRecording)}>
          <Text style={styles.btnText}>Resume</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.btn} onPress={stopRecording} disabled={!recording}>
          <Text style={styles.btnText}>Stop</Text>
        </TouchableOpacity>
      </View>

      <View style={{ marginTop: 20 }}>
        <Text>Recording state: {recording ? (recordingStatus ? (recordingStatus.isRecording ? 'Recording' : 'Paused') : 'Preparing...') : 'Not recording'}</Text>
        <Text>Elapsed: {recordingStatus ? formatMillis(recordingStatus.durationMillis) : '00:00'}</Text>
        <Text>Saved file: {savedUri ? savedUri : '—'}</Text>
        {isPausedByInterruption ? <Text style={{ color: 'orange' }}>Paused due to mic interruption</Text> : null}
      </View>

      <View style={{ marginTop: 20 }}>
        <TouchableOpacity style={[styles.btn, { backgroundColor: '#4CAF50' }]} onPress={playRecording} disabled={!savedUri}>
          <Text style={styles.btnText}>Play Saved</Text>
        </TouchableOpacity>
      </View>

      <View style={{ marginTop: 40 }}>
        <Text style={{ fontSize: 12, color: '#666' }}>Tips:</Text>
        <Text style={{ fontSize: 12, color: '#666' }}>• On iOS add UIBackgroundModes: ['audio'] to app.json infoPlist to keep recording in background.</Text>
        <Text style={{ fontSize: 12, color: '#666' }}>• If the phone receives a call, the OS may take mic control — this app detects that and marks "Paused due to mic interruption" and will resume when the recording status indicates recording again.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    backgroundColor: '#fff',
    justifyContent: 'flex-start',
  },
  title: {
    fontSize: 22,
    fontWeight: '600',
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  btn: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#2196F3',
    borderRadius: 8,
    marginHorizontal: 6,
  },
  btnText: {
    color: '#fff',
    fontWeight: '600',
  },
});
