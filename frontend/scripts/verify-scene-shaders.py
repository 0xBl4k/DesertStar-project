"""Compile the actual app shaders and check rendered pixels using surfaceless EGL.

Invoked by test-scene-shaders.mjs. Uses Python's standard library and Mesa EGL;
it does not start or automate a browser. Matrices and reference rays come from
Three.js; the shader receives real ephemeris Sun directions at two camera angles.
"""
import ctypes as c
import ctypes.util
import json
import sys


def run(data):
    egl = c.CDLL(ctypes.util.find_library('EGL'))

    def bind(name, result, *args):
        function = getattr(egl, name)
        function.restype, function.argtypes = result, args
        return function

    display = bind('eglGetPlatformDisplay', c.c_void_p, c.c_uint, c.c_void_p, c.POINTER(c.c_int))(0x31DD, None, None)
    major, minor = c.c_int(), c.c_int()
    assert bind('eglInitialize', c.c_uint, c.c_void_p, c.POINTER(c.c_int), c.POINTER(c.c_int))(display, c.byref(major), c.byref(minor)), 'EGL could not initialize'
    assert bind('eglBindAPI', c.c_uint, c.c_uint)(0x30A0), 'OpenGL ES is unavailable'
    attributes = (c.c_int * 15)(0x3033, 1, 0x3040, 0x40, 0x3024, 8, 0x3023, 8, 0x3022, 8, 0x3021, 8, 0x3025, 24, 0x3038)
    config, count = c.c_void_p(), c.c_int()
    assert bind('eglChooseConfig', c.c_uint, c.c_void_p, c.POINTER(c.c_int), c.POINTER(c.c_void_p), c.c_int, c.POINTER(c.c_int))(display, attributes, c.byref(config), 1, c.byref(count)) and count.value, 'No offscreen EGL config'
    surface = bind('eglCreatePbufferSurface', c.c_void_p, c.c_void_p, c.c_void_p, c.POINTER(c.c_int))(display, config, (c.c_int * 5)(0x3057, 128, 0x3056, 128, 0x3038))
    context = bind('eglCreateContext', c.c_void_p, c.c_void_p, c.c_void_p, c.c_void_p, c.POINTER(c.c_int))(display, config, None, (c.c_int * 3)(0x3098, 3, 0x3038))
    assert surface and context, 'No offscreen OpenGL ES context'
    assert bind('eglMakeCurrent', c.c_uint, c.c_void_p, c.c_void_p, c.c_void_p, c.c_void_p)(display, surface, surface, context)
    get_proc = bind('eglGetProcAddress', c.c_void_p, c.c_char_p)

    def gl(name, result, *args):
        pointer = get_proc(name.encode())
        assert pointer, name + ' is unavailable'
        return c.CFUNCTYPE(result, *args)(pointer)

    create_shader = gl('glCreateShader', c.c_uint, c.c_uint)
    shader_source = gl('glShaderSource', None, c.c_uint, c.c_int, c.POINTER(c.c_char_p), c.POINTER(c.c_int))
    compile_shader = gl('glCompileShader', None, c.c_uint)
    shader_status = gl('glGetShaderiv', None, c.c_uint, c.c_uint, c.POINTER(c.c_int))
    shader_log = gl('glGetShaderInfoLog', None, c.c_uint, c.c_int, c.POINTER(c.c_int), c.c_void_p)
    create_program = gl('glCreateProgram', c.c_uint)
    attach = gl('glAttachShader', None, c.c_uint, c.c_uint)
    link = gl('glLinkProgram', None, c.c_uint)
    program_status = gl('glGetProgramiv', None, c.c_uint, c.c_uint, c.POINTER(c.c_int))
    program_log = gl('glGetProgramInfoLog', None, c.c_uint, c.c_int, c.POINTER(c.c_int), c.c_void_p)
    programs = {}
    for name, sources in data['programs'].items():
        program = create_program()
        for kind, source in [(0x8B31, sources['vertex']), (0x8B30, sources['fragment'])]:
            shader = create_shader(kind)
            text = c.c_char_p(source.encode())
            shader_source(shader, 1, c.byref(text), None)
            compile_shader(shader)
            status = c.c_int()
            shader_status(shader, 0x8B81, c.byref(status))
            log = c.create_string_buffer(4096)
            shader_log(shader, 4096, None, log)
            assert status.value, name + ': ' + log.value.decode()
            attach(program, shader)
        link(program)
        status = c.c_int()
        program_status(program, 0x8B82, c.byref(status))
        log = c.create_string_buffer(4096)
        program_log(program, 4096, None, log)
        assert status.value, name + ': ' + log.value.decode()
        programs[name] = program

    gen_buffers = gl('glGenBuffers', None, c.c_int, c.POINTER(c.c_uint))
    bind_buffer = gl('glBindBuffer', None, c.c_uint, c.c_uint)
    buffer_data = gl('glBufferData', None, c.c_uint, c.c_ssize_t, c.c_void_p, c.c_uint)
    buffers = {}
    for name in ['positions', 'normals', 'uv', 'indices']:
        values = (c.c_ushort if name == 'indices' else c.c_float) * len(data[name])
        array = values(*data[name])
        buffer = c.c_uint()
        gen_buffers(1, c.byref(buffer))
        target = 0x8893 if name == 'indices' else 0x8892
        bind_buffer(target, buffer)
        buffer_data(target, c.sizeof(array), array, 0x88E4)
        buffers[name] = buffer
    # Use the exact bundled NASA textures, not synthetic test textures.
    from PIL import Image
    textures={}
    gen_textures=gl('glGenTextures',None,c.c_int,c.POINTER(c.c_uint))
    bind_texture=gl('glBindTexture',None,c.c_uint,c.c_uint)
    active_texture=gl('glActiveTexture',None,c.c_uint)
    tex_parameter=gl('glTexParameteri',None,c.c_uint,c.c_uint,c.c_int)
    tex_image=gl('glTexImage2D',None,c.c_uint,c.c_int,c.c_int,c.c_int,c.c_int,c.c_int,c.c_uint,c.c_uint,c.c_void_p)
    def upload_texture(name,unit,image):
        texture=c.c_uint();gen_textures(1,c.byref(texture));active_texture(0x84C0+unit);bind_texture(0x0DE1,texture)
        for parameter,value in [(0x2801,0x2601),(0x2800,0x2601),(0x2802,0x812F),(0x2803,0x812F)]:tex_parameter(0x0DE1,parameter,value)
        image=image.convert('RGBA').transpose(Image.Transpose.FLIP_TOP_BOTTOM)
        pixels=c.create_string_buffer(image.tobytes());tex_image(0x0DE1,0,0x1908,*image.size,0,0x1908,0x1401,pixels)
        textures[name]=(unit,texture)
    for unit,name in enumerate(['sun','clouds','moon']):upload_texture(name,unit,Image.open(data['assets'][name]))
    upload_texture('clearShadow',3,Image.new('RGBA',(2,2),(255,255,255,255)))
    upload_texture('blockedShadow',4,Image.new('RGBA',(2,2),(0,0,0,0)))
    enable = gl('glEnable', None, c.c_uint)
    enable(0x0B71)
    enable(0x0B44)
    cull = gl('glCullFace', None, c.c_uint)
    use = gl('glUseProgram', None, c.c_uint)
    attribute = gl('glGetAttribLocation', c.c_int, c.c_uint, c.c_char_p)
    enable_attribute = gl('glEnableVertexAttribArray', None, c.c_uint)
    set_attribute = gl('glVertexAttribPointer', None, c.c_uint, c.c_int, c.c_uint, c.c_uint, c.c_int, c.c_void_p)
    uniform = gl('glGetUniformLocation', c.c_int, c.c_uint, c.c_char_p)
    matrix4 = gl('glUniformMatrix4fv', None, c.c_int, c.c_int, c.c_uint, c.POINTER(c.c_float))
    matrix3 = gl('glUniformMatrix3fv', None, c.c_int, c.c_int, c.c_uint, c.POINTER(c.c_float))
    vector3 = gl('glUniform3f', None, c.c_int, c.c_float, c.c_float, c.c_float)
    scalar = gl('glUniform1f', None, c.c_int, c.c_float)
    integer = gl('glUniform1i',None,c.c_int,c.c_int)
    clear_color = gl('glClearColor', None, c.c_float, c.c_float, c.c_float, c.c_float)
    clear = gl('glClear', None, c.c_uint)
    viewport = gl('glViewport', None, c.c_int, c.c_int, c.c_int, c.c_int)
    draw = gl('glDrawElements', None, c.c_uint, c.c_int, c.c_uint, c.c_void_p)
    read = gl('glReadPixels', None, c.c_int, c.c_int, c.c_int, c.c_int, c.c_uint, c.c_uint, c.c_void_p)
    identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]

    def render(name, case, hatch=0, blocked=False):
        program = programs[name]
        use(program)
        cull(0x0404 if name in ('glow', 'atmosphere') else 0x0405)
        for key, label, size in [('positions', b'position', 3), ('normals', b'normal', 3), ('uv', b'uv', 2)]:
            index = attribute(program, label)
            if index < 0:
                continue
            bind_buffer(0x8892, buffers[key])
            enable_attribute(index)
            set_attribute(index, size, 0x1406, 0, 0, None)
        bind_buffer(0x8893, buffers['indices'])
        for key, values in [('modelMatrix', identity), ('modelViewMatrix', case['view']), ('projectionMatrix', case['projection'])]:
            matrix4(uniform(program, key.encode()), 1, 0, (c.c_float * 16)(*values))
        matrix3(uniform(program, b'normalMatrix'), 1, 0, (c.c_float * 9)(*case['normal']))
        matrix4(uniform(program,b'viewMatrix'),1,0,(c.c_float*16)(*case['view']))
        for texture_name,label in [('sun',b'surface'),('clouds',b'cloudMap'),('moon',b'map')]:
            integer(uniform(program,label),textures[texture_name][0])
        integer(uniform(program,b'isOrthographic'),1)
        vector3(uniform(program,b'lunarSun'),*case['sun'])
        scalar(uniform(program,b'nightStrength'),.9);scalar(uniform(program,b'nightHatching'),hatch)
        vector3(uniform(program,b'diffuse'),1,1,1);vector3(uniform(program,b'emissive'),0,0,0)
        scalar(uniform(program,b'opacity'),1);scalar(uniform(program,b'roughness'),1);scalar(uniform(program,b'metalness'),0)
        vector3(uniform(program,b'ambientLightColor'),.08,.08,.08)
        view=case['view'];sun=case['sun'];light=[sum(view[i+j*4]*sun[j] for j in range(3)) for i in range(3)]
        vector3(uniform(program,b'directionalLights[0].direction'),*light)
        vector3(uniform(program,b'directionalLights[0].color'),3.1,3.1,3.1)
        integer(uniform(program,b'receiveShadow'),1)
        integer(uniform(program,b'directionalShadowMap[0]'),textures['blockedShadow' if blocked else 'clearShadow'][0])
        shadow=[.2,0,0,0, 0,.2,0,0, 0,0,0,0, .5,.5,.5,1]
        matrix4(uniform(program,b'directionalShadowMatrix[0]'),1,0,(c.c_float*16)(*shadow))
        scalar(uniform(program,b'directionalLightShadows[0].shadowIntensity'),1)
        scalar(uniform(program,b'directionalLightShadows[0].shadowBias'),0)
        scalar(uniform(program,b'directionalLightShadows[0].shadowNormalBias'),0)
        scalar(uniform(program,b'directionalLightShadows[0].shadowRadius'),1)
        gl('glUniform2f',None,c.c_int,c.c_float,c.c_float)(uniform(program,b'directionalLightShadows[0].shadowMapSize'),2,2)
        vector3(uniform(program, b'sunDirection'), *case['sun'])
        vector3(uniform(program, b'cameraPosition'), *case['camera'])
        vector3(uniform(program, b'nightColor'), .01, .03, .07)
        vector3(uniform(program, b'glowColor'), .2, .6, 1.)
        scalar(uniform(program, b'strength'), .78)
        scalar(uniform(program, b'hatching'), hatch)
        scalar(uniform(program, b'radiance'), 1.3)
        viewport(0, 0, 128, 128)
        clear_color(0, 0, 0, 0)
        clear(0x4000 | 0x0100)
        draw(4, len(data['indices']), 0x1403, None)
        pixels = (c.c_ubyte * (128 * 128 * 4))()
        read(0, 0, 128, 128, 0x1908, 0x1401, pixels)
        return bytes(pixels)

    checked = 0
    for case in data['cases']:
        pixels = render('mask', case)
        for expected in case['expected']:
            alpha = pixels[(expected['y'] * 128 + expected['x']) * 4 + 3]
            assert alpha > 100 if expected['night'] else alpha < 4, (case['name'], expected, alpha)
            checked += 1
    plain = render('mask', data['cases'][0])
    hatched = render('mask', data['cases'][0], 1)
    assert sum(a != b for a, b in zip(plain, hatched)) > 100, 'Night hatching had no rendered effect'
    glow = render('glow', data['cases'][0])
    assert max(glow[3::4]) > 30, 'Glow shader did not render a rim'
    # Render each new material, not just compile it. Texture variations must
    # survive while the atmosphere responds to illumination and leaves its center clear.
    case = dict(data['cases'][0], sun=[0, 0, 1])
    sun = render('sun', case)
    assert sun[(64*128+64)*4+3] == 255, 'Sun disk is missing'
    inner = [tuple(sun[(y*128+x)*4:(y*128+x)*4+3]) for y in range(38,91) for x in range(38,91)]
    assert len(set(inner)) > 150, 'NASA solar map has no rendered surface detail'
    assert sun[(64*128+64)*4+1] > sun[(64*128+119)*4+1], 'Solar limb darkening is missing'
    clouds = render('clouds', case)
    assert max(clouds[3::4]) > 80 and clouds[3::4].count(0) > 1000, 'Cloud coverage has no gaps or wisps'
    atmosphere = render('atmosphere', case)
    assert atmosphere[(64*128+64)*4+3] < 4 and max(atmosphere[3::4]) > 30, 'Atmosphere has no thin rim'
    dark = render('atmosphere', dict(case, sun=[0,0,-1]))
    assert atmosphere != dark, 'Atmosphere ignores the Sun direction'
    moon=render('moon',case)
    away=render('moon',dict(case,sun=[0,0,-1]))
    center=(64*128+64)*4
    assert sum(moon[center:center+3])>sum(away[center:center+3])*2, 'Moon surface night shading did not follow the Sun'
    assert moon!=render('moon',case,1), 'Surface hatching had no effect'
    clear_shadow=render('moonShadow',case)
    blocked_shadow=render('moonShadow',case,blocked=True)
    assert sum(clear_shadow[center:center+3])>sum(blocked_shadow[center:center+3])*2, 'Actual lunar material ignores terrain shadow occlusion'
    # Optional image dump for visual inspection, without extra dependencies.
    if len(sys.argv) > 1:
        from pathlib import Path
        folder=Path(sys.argv[1]); folder.mkdir(parents=True,exist_ok=True)
        for name in ['sun','clouds','atmosphere','moon','moonShadow']:
            pixels=render(name,case)
            rgb=bytes(channel for row in range(127,-1,-1) for col in range(128) for channel in pixels[(row*128+col)*4:(row*128+col)*4+3])
            (folder/(name+'.ppm')).write_bytes(b'P6\n128 128\n255\n'+rgb)
    print(json.dumps({'shader_programs_compiled': list(programs), 'ephemeris_camera_cases': len(data['cases']), 'day_night_pixel_checks': checked, 'hatching_and_glow': 'passed', 'nasa_maps_surface_shading_shadow_occlusion': 'passed', 'egl_version': [major.value, minor.value]}))
    bind('eglMakeCurrent', c.c_uint, c.c_void_p, c.c_void_p, c.c_void_p, c.c_void_p)(display, None, None, None)
    bind('eglDestroyContext', c.c_uint, c.c_void_p, c.c_void_p)(display, context)
    bind('eglDestroySurface', c.c_uint, c.c_void_p, c.c_void_p)(display, surface)
    bind('eglTerminate', c.c_uint, c.c_void_p)(display)


if __name__ == '__main__':
    run(json.load(sys.stdin))
