#!/bin/sh
# Regenerates test/audio-fixtures/speech-guard/*. Needs espeak-ng and ffmpeg. All audio is synthetic (see the README there).
set -eu
OUT="$(cd "$(dirname "$0")/.." && pwd)/test/audio-fixtures/speech-guard"
TMP="$(mktemp -d)"
cd "$TMP"

say() { espeak-ng -s 150 -w "$1.raw.wav" "$2"; ffmpeg -v error -y -i "$1.raw.wav" -ac 1 -ar 48000 -c:a pcm_s16le "$1.wav"; }
sil() { ffmpeg -v error -y -f lavfi -i "anullsrc=r=48000:cl=mono" -t "$2" -c:a pcm_s16le "$1.wav"; }
noise() { ffmpeg -v error -y -f lavfi -i "anoisesrc=color=$2:amplitude=$3:r=48000" -t "$4" -ac 1 -c:a pcm_s16le "$1.wav"; }
cat_() { out=$1; shift; set --  "$@"; args=""; fc=""; i=0; for f in "$@"; do args="$args -i $f.wav"; fc="$fc[$i:a]"; i=$((i+1)); done
  ffmpeg -v error -y $args -filter_complex "${fc}concat=n=$i:v=0:a=1" -ac 1 -ar 48000 -c:a pcm_s16le "$out.wav"; }

say normal "Technology is very useful for young people. I use my phone every day to talk with my friends and to study English. Social media can be dangerous, but I think schools should teach students how to use it carefully."
say p1 "Well, I think technology is useful."
say p2 "For example, I talk with my cousin every day on video call."
say p3 "But sometimes it is difficult to concentrate."
say short "I like phones."
say hes "Um, well, I think that, uh, technology is, is very useful for, for young people. Er, but sometimes, um, it is difficult."
say errors "Yesterday I have went to the market and I buy two bread. My friend he don't like technology because it make people lazy."

sil silence 8; sil sil5 5
noise nearsil white 0.002 8          # open microphone in a quiet room (about -66 dBFS)
noise quietroom pink 0.01 8
noise fan white 0.05 8               # loud steady noise
ffmpeg -v error -y -f lavfi -i "sine=frequency=50:sample_rate=48000" -t 8 -ac 1 -c:a pcm_s16le hum.wav
ffmpeg -v error -y -f lavfi -i "anoisesrc=color=pink:amplitude=0.01:r=48000" -t 10 -af "tremolo=f=0.4:d=0.7" -ac 1 wander.wav
ffmpeg -v error -y -f lavfi -i "aevalsrc='if(lt(t,0.15),0.8*sin(2*PI*1000*t),0)':s=48000:d=8" -ac 1 -c:a pcm_s16le click.wav
ffmpeg -v error -y -f lavfi -i "aevalsrc='if(lt(mod(t,0.5),0.12),0.5*sin(2*PI*2000*t),0)':s=48000:d=8" -ac 1 -c:a pcm_s16le clicktrain.wav
ffmpeg -v error -y -f lavfi -i "anoisesrc=color=white:amplitude=0.4:r=48000" -t 8 -af "volume='if(lt(mod(t,0.35),0.04),1,0)':eval=frame" -ac 1 -c:a pcm_s16le keyboard.wav
ffmpeg -v error -y -f lavfi -i "anoisesrc=color=brown:amplitude=0.5:r=48000" -t 8 -af "volume='if(between(t,3,3.4),1,0)':eval=frame" -ac 1 -c:a pcm_s16le cough.wav

cat_ longpause p1 sil5 p2
cat_ leadsil sil5 normal
cat_ trailsil normal sil5
sil sil1 1; cat_ multipause p1 sil1 p2 sil1 p3 sil1 hes
cat_ leadtrail sil5 short sil5
ffmpeg -v error -y -i normal.wav -af volume=-30dB quiet30.wav
ffmpeg -v error -y -i normal.wav -af volume=-40dB quiet40.wav
ffmpeg -v error -y -i normal.wav -f lavfi -i "anoisesrc=color=pink:amplitude=0.02:r=48000" -filter_complex "[0:a]volume=0.5[a];[a][1:a]amix=inputs=2:duration=first:normalize=0" snr_noise.wav
ffmpeg -v error -y -i normal.wav -f lavfi -i "anoisesrc=color=pink:amplitude=0.1:r=48000" -filter_complex "[0:a]volume=0.5[a];[a][1:a]amix=inputs=2:duration=first:normalize=0" snr_loud.wav

for f in normal short hes errors longpause leadsil trailsil multipause quiet30 quiet40 snr_noise snr_loud silence nearsil quietroom fan hum click clicktrain cough keyboard wander leadtrail; do
  ffmpeg -v error -y -i "$f.wav" -c:a libopus -b:a 32k -ac 1 -ar 48000 -f webm "$OUT/$f.webm"
done
ffmpeg -v error -y -i normal.wav -c:a aac -b:a 64k -ac 1 -f mp4 "$OUT/normal.m4a"
ffmpeg -v error -y -i normal.wav -c:a libopus -b:a 32k -ac 1 -f ogg "$OUT/normal.ogg"
ffmpeg -v error -y -i silence.wav -c:a aac -b:a 64k -ac 1 -f mp4 "$OUT/silence.m4a"
ffmpeg -v error -y -i nearsil.wav -c:a libopus -b:a 32k -ac 1 -f ogg "$OUT/nearsil.ogg"
rm -rf "$TMP"
