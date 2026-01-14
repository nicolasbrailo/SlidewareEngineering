.PHONY: clips
clips: clips/music1.mp3 clips/music2.mp3 clips/speech1.mp3 clips/speech2.mp3 clips/speech3.mp3

clips/music1.mp3:
	# https://incompetech.com/music/royalty-free/music.html
	wget -O clips/tmp.mp3 https://incompetech.com/music/royalty-free/mp3-royaltyfree/Funky%20Boxstep%20.mp3
	ffmpeg -ss 90 -i clips/tmp.mp3 -t 60 -af "afade=t=in:st=0:d=1,afade=t=out:st=59:d=1" $@

clips/music2.mp3:
	# https://incompetech.com/music/royalty-free/music.html
	wget -O clips/tmp.mp3 https://incompetech.com/music/royalty-free/mp3-royaltyfree/Grand%20Dark%20Waltz%20Trio%20Vivace.mp3
	ffmpeg -ss 90 -i clips/tmp.mp3 -t 60 -af "afade=t=in:st=0:d=1,afade=t=out:st=59:d=1" $@

clips/speech1.mp3:
	# https://archive.org/details/commonlaw_2011_librivox/commonlaw_08_holmes_128kb.mp3
	wget -O clips/tmp.mp3 https://dn721907.ca.archive.org/0/items/commonlaw_2011_librivox/commonlaw_08_holmes_128kb.mp3
	ffmpeg -ss 90 -i clips/tmp.mp3 -t 60 -af "afade=t=in:st=0:d=1,afade=t=out:st=59:d=1" $@

clips/speech2.mp3:
	# https://archive.org/details/antiseptic_principle_surgery_librivox
	wget -O clips/tmp.mp3 https://ia804502.us.archive.org/6/items/antiseptic_principle_surgery_librivox/antisepticprinciple_lister_mac.mp3
	ffmpeg -ss 90 -i clips/tmp.mp3 -t 60 -af "afade=t=in:st=0:d=1,afade=t=out:st=59:d=1" $@

clips/speech3.mp3:
	# https://archive.org/details/meteorology_weather_explained_1205b_librivox/meteorology_05_mcpherson.mp3
	wget -O clips/tmp.mp3 https://ia801404.us.archive.org/11/items/meteorology_weather_explained_1205b_librivox/meteorology_05_mcpherson.mp3 
	ffmpeg -ss 90 -i clips/tmp.mp3 -t 60 -af "afade=t=in:st=0:d=1,afade=t=out:st=59:d=1" clips/speech3.mp3

.PHONY: run_server
run_server:
	python3 -m http.server

.PHONY: system_deps clean update_all_extdeps

clean:
	rm -rf build

system_deps:
	@# Only needed to rebuild the js deps from scratch
	sudo apt-get install nodejs npm

update_all_extdeps: extdeps/deps.css extdeps/deps.js

# Order is important for cat
extdeps/deps.js: \
      build/jquery.min.js \
      build/impress.js/js/impress.min.js build/impress-slide-num.js \
      build/highlight.min.js
	@# Cat and add a \n after each file
	awk '{print} END{print ""}' $^ > $@
extdeps/deps.css: \
      build/highlight.min.css \
      build/highlight.theme.min.css
	awk '{print} END{print ""}' $^ > $@

build:
	mkdir build

build/jquery.min.js: build
	wget https://code.jquery.com/jquery-3.7.1.min.js -O $@

build/impress.js/js/impress.min.js: build
	git clone --recursive https://github.com/impress/impress.js.git ./build/impress.js || true
	cd build/impress.js && npm install && node build.js
build/impress-slide-num.js: build
	wget https://raw.githubusercontent.com/tanayseven/ImpressJS-Slide-Numbering/refs/heads/master/js/impress-slide-num.js -O $@

build/highlight.min.css: build
	wget https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/styles/default.min.css -O $@
build/highlight.theme.min.css: build
	wget https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.11.1/build/styles/github-dark.min.css -O $@
build/highlight.min.js: build
	wget https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/highlight.min.js -O $@

