// Private stdin/stdout worker linked to the existing local whisper.cpp build.
// One model per process; no microphone, sockets or cross-utterance text context.
#include "whisper.h"
#include "common-whisper.h"
#include "json.hpp"
#include <iostream>
#include <string>
#include <vector>
int main(int argc, char **argv) {
 if (argc != 3) return 2;
 whisper_log_set([](ggml_log_level, const char *, void *) {}, nullptr);
 auto options = whisper_context_default_params();
 options.use_gpu = false; // Installed library was built with GGML_METAL=OFF.
 auto *context = whisper_init_from_file_with_params(argv[1], options);
 if (!context) return 3;
 std::cout << "{\"ready\":true}" << std::endl;
 std::string path;
 while (std::getline(std::cin, path)) {
  std::vector<float> samples;
  std::vector<std::vector<float>> channels;
  if (!read_audio_data(path, samples, channels, false) || samples.empty() || samples.size() > 488000) {
   std::cout << "{\"error\":\"Invalid recording\"}" << std::endl;
   continue;
  }
  auto params = whisper_full_default_params(WHISPER_SAMPLING_BEAM_SEARCH);
  params.n_threads = std::stoi(argv[2]);
  params.language = "auto";
  params.no_context = true;
  params.no_timestamps = true;
  params.print_realtime = false;
  params.print_progress = false;
  params.print_timestamps = false;
  if (whisper_full(context, params, samples.data(), samples.size()) != 0) {
   std::cout << "{\"error\":\"Transcription failed\"}" << std::endl;
   continue;
  }
  std::string text;
  for (int i = 0; i < whisper_full_n_segments(context); ++i) text += whisper_full_get_segment_text(context, i);
  std::cout << nlohmann::json({{"text", text}}).dump() << std::endl;
 }
 whisper_free(context);
}
