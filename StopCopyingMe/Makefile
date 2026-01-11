# Speech https://salford.primo.exlibrisgroup.com/discovery/fulldisplay/alma9913412239501611/44SAL_INST:SAL_MAIN
# Music https://incompetech.com/music/royalty-free/music.html
clips/music1.mp3:
	mkdir -p clips
	wget https://incompetech.com/music/royalty-free/mp3-royaltyfree/Funky%20Boxstep%20.mp3 -O clips/music1.mp3
clips/speech1.mp3:
	# https://archive.org/details/tolkiens_thechildrenofhurin_audiobook_readby_sirchristopherlee/
	wget -O $@ https://archive.org/download/tolkiens_thechildrenofhurin_audiobook_readby_sirchristopherlee/CHAPTER%203%20-%20THE%20WORDS%20OF%20H%C3%9ARIN%20AND%20MORGOTH%20.mp3
clips/speech2.mp3:
	# https://archive.org/details/TheHobbitAudiobook
	wget -O $@ https://ia803100.us.archive.org/10/items/TheHobbitAudiobook/The%20Hobbit/Chapter%2003%20-%20A%20Short%20Rest.mp

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

