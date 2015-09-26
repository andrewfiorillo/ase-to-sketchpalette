
function loadAse(rawData, callback) {

	var version_major, version_minor, count, i, view, palette = {}, flattened = [];

	try {
		view = new jDataView(rawData, 0, undefined, false); // big-endian format
	} catch(e) {
		view = null;
	}
	
	
	if (!view ||
		"ASEF" !== view.getString(4) ||
		(version_major = view.getInt16()) < 1 ||
		(version_minor = view.getInt16()) < 0 ||
		(count = view.getInt32()) < 1) {
		
		callback(null, null, "illegal file format, not a ASE color palette file");
	}

	
	function rgb2str(rgb) {

		var r = rgb[0].toString(16);
		if (r.length < 2) r = "0" + r;
		
		var g = rgb[1].toString(16);
		if (g.length < 2) g = "0" + g;
		
		var b = rgb[2].toString(16);
		if (b.length < 2) b = "0" + b;
		
		return "#" + r + g + b;
		
	}

	
	function parse_utf16_Cstring(view) {
		
		var slen = view.getUint16();
		var c, name = "", i = slen;
		
		// ignore NUL sentinel at the end of the string
		while (--i > 0) {
			c = view.getUint16();
			name += String.fromCharCode(c);
		}
		view.getUint16();
		return name;
		
	}


	function parse_block(view, palette) {
		
		// parse block
		var i, id, len, slen, model, type, c, m, k, l, a, r, g, b, x, y, z, name, p;

		while (--count >= 0) {
			
			id = view.getUint16();
			
			switch (id) {
			
				default:
					// illegal block; damaged ASE file?
					callback(null, null, "unknown block type " + id.toString(16) + ": broken ASE color palette file");
					return -1;

				case 0xc001: // group start
					len = view.getUint32();
					name = parse_utf16_Cstring(view);
					
					if (!palette.groups) palette.groups = [];
					
					palette.groups.push(p = { name: name });
					
					if (parse_block(view, p)) return -1;
					
					continue;

				case 0xc002: // group end
					view.getUint32(); // skip 0 length
					return 0;

				case 0x0001: // color
					len = view.getUint32();
					name = parse_utf16_Cstring(view);
					model = view.getString(4);
					
					if (!palette.colors) palette.colors = [];
					
					palette.colors.push(p = {
						name: name,
						model: model
					});
					
					switch (model) {
						
						case "CMYK":
							c = view.getFloat32();
							m = view.getFloat32();
							y = view.getFloat32();
							k = view.getFloat32();
							p.cmyk = [c, m, y, k];

							if (k >= 1) {
								//Black
								r = g = b = 0;
							} else {
								//CMYK and CMY values from 0 to 1
								c = c * (1 - k) + k;
								m = m * (1 - k) + k;
								y = y * (1 - k) + k;

								//CMY values from 0 to 1
								//RGB results from 0 to 255
								r = (1 - c);
								g = (1 - m);
								b = (1 - y);

								r = Math.min(255, Math.max(0, Math.round(r * 255)));
								g = Math.min(255, Math.max(0, Math.round(g * 255)));
								b = Math.min(255, Math.max(0, Math.round(b * 255)));
							}
							
							flattened.push(rgb2str(p.html_rgb = [r, g, b]));
							break;
							
						case "RGB ":
							r = view.getFloat32();
							g = view.getFloat32();
							b = view.getFloat32();
							p.rgb = [r, g, b];  // also keep the raw RGB

							r = Math.min(255, Math.max(0, Math.round(r * 255)));
							g = Math.min(255, Math.max(0, Math.round(g * 255)));
							b = Math.min(255, Math.max(0, Math.round(b * 255)));
							flattened.push(rgb2str(p.html_rgb = [r, g, b]));
							break;

						case "LAB ":
							l = view.getFloat32();
							a = view.getFloat32();
							b = view.getFloat32();
							p.lab = [l, a, b];

							// Photoshop CS5.5 saves these as perunage (0..1), value, value. So we need to adjust L before commencing:
							l *= 100;

							// CIE-L*ab -> XYZ
							y = (l + 16) / 116;
							x = a / 500 + y;
							z = y - b / 200;

							if (Math.pow(y, 3) > 0.008856) y = Math.pow(y, 3);
							else y = (y - 16 / 116) / 7.787;
							
							if (Math.pow(x, 3) > 0.008856) x = Math.pow(x, 3);
							else x = (x - 16 / 116) / 7.787;
							
							if (Math.pow(z, 3) > 0.008856) z = Math.pow(z, 3);
							else z = (z - 16 / 116) / 7.787;

							x = 95.047 * x;      //ref_X =  95.047     Observer= 2Â°, Illuminant= D65
							y = 100.000 * y;     //ref_Y = 100.000
							z = 108.883 * z;     //ref_Z = 108.883

							// XYZ -> RGB
							x = x / 100;        //X from 0 to  95.047      (Observer = 2Â°, Illuminant = D65)
							y = y / 100;        //Y from 0 to 100.000
							z = z / 100;        //Z from 0 to 108.883

							r = x *  3.2406 + y * -1.5372 + z * -0.4986;
							g = x * -0.9689 + y *  1.8758 + z *  0.0415;
							b = x *  0.0557 + y * -0.2040 + z *  1.0570;

							if (r > 0.0031308) r = 1.055 * Math.pow(r, 1 / 2.4) - 0.055;
							else r = 12.92 * r;
							
							if (g > 0.0031308) g = 1.055 * Math.pow(g, 1 / 2.4) - 0.055;
							else g = 12.92 * g;
							
							if (b > 0.0031308) b = 1.055 * Math.pow(b, 1 / 2.4) - 0.055;
							else b = 12.92 * b;

							r = Math.min(255, Math.max(0, Math.round(r * 255)));
							g = Math.min(255, Math.max(0, Math.round(g * 255)));
							b = Math.min(255, Math.max(0, Math.round(b * 255)));
							flattened.push(rgb2str(p.html_rgb = [r, g, b]));
							break;

						case "GRAY":
							g = view.getFloat32();
							p.gray = g;

							g = Math.min(255, Math.max(0, Math.round(g * 255)));
							flattened.push(rgb2str(p.html_rgb = [g, g, g]));
							break;

						default:
							callback(null, null, "unknown color model " + model + ": broken ASE color palette file");
							return -1;
					}
					
					type = view.getUint16();
					p.color_type = type; // (0 => Global, 1 => Spot, 2 => Normal)
					
					continue;
			}
			
		}
		
		return 0;
	}

	if (!parse_block(view, palette)) callback(palette, flattened);

}