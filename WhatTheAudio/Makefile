.PHONY: bootstrap run_server distclean clean media_examples

run_server: impress.min.js
	python3 -m http.server

clean:
	rm -rf impress.js

distclean:
	rm impress.min.js
	rm -f media

impress.min.js:
	git clone --recursive https://github.com/impress/impress.js.git
	cd impress.js && npm install && node build.js
	cp impress.js/js/impress.min.js .

media_examples: media/awesome_in_space.mp3 \
								media/awesome_in_space.mp4 \
								media/ais_24.mov \
								media/ais_15.mov \
								media/ais_10.mov \
								media/ais_5.mov \
								media/music1.mp3 \
								media/music2.mp3

media/music1.mp3:
	wget https://incompetech.com/music/royalty-free/mp3-royaltyfree/I%20Got%20a%20Stick%20Arr%20Bryan%20Teoh.mp3 && mv "I Got a Stick Arr Bryan Teoh.mp3" media/music1.mp3

media/music2.mp3:
	wget https://incompetech.com/music/royalty-free/mp3-royaltyfree/Bleeping%20Demo.mp3 && mv "Bleeping Demo.mp3" media/music2.mp3

media/tears_of_steel_720p.mov:
	# From https://mango.blender.org/download/ - this is a very slow op, download manual and mv
	mkdir -p media
	wget http://ftp.nluug.nl/pub/graphics/blender/demo/movies/ToS/tears_of_steel_720p.mov && mv tears_of_steel_720p.mov media

media/ais_24.mov media/ais_15.mov media/ais_10.mov media/ais_5.mov: media/tears_of_steel_720p.mov
	ffmpeg -y -ss "5:21" -i media/tears_of_steel_720p.mov -t 8 -c copy media/ais_24.mov
	ffmpeg -y -i media/ais_24.mov -filter:v fps=15 media/ais_15.mov
	ffmpeg -y -i media/ais_24.mov -filter:v fps=10 media/ais_10.mov
	ffmpeg -y -i media/ais_24.mov -filter:v fps=5  media/ais_5.mov

media/awesome_in_space.mp3 media/awesome_in_space.mp4: media/ais_24.mov media/ais_15.mov media/ais_10.mov media/ais_5.mov
	ffmpeg \
		-y \
		-i media/ais_24.mov \
		-i media/ais_15.mov \
		-i media/ais_10.mov \
		-i media/ais_5.mov \
		-filter_complex '[0:v]pad=iw*2:ih*2[x];[x][1:v]overlay=W/2:0[xx];[xx][2:v]overlay=0:H/2[xxx];[xxx][3:v]overlay=W/2:H/2[vid]' \
		-map '0:a' \
		-map '[vid]' \
		-c:v libx264 \
		-crf 23 \
		-preset veryfast \
		media/awesome_in_space.mp4 \
		-map '0:a' \
		-c copy \
		media/awesome_in_space.mp3
