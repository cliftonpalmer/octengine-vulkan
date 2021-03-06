#version 450
#extension GL_ARB_separate_shader_objects : enable

layout (binding = 2) uniform sampler2DMS samplerAlbedo;
layout (binding = 3) uniform sampler2DMS samplerNormal;
layout (binding = 4) uniform sampler2DMS samplerPosition;
layout (binding = 5) uniform sampler2DMS samplerPBR;
layout (binding = 6) uniform sampler2DMS samplerDepth;
layout (binding = 7) uniform sampler2DArray shadowDepth;
layout (binding = 8) uniform samplerCube samplerSkybox;
layout (binding = 9) uniform sampler2D samplerSky;
layout (binding = 10) uniform samplerCube samplerIllumination;

struct light {
    vec4 position;
    vec4 direction;
    vec4 color;
    ivec4 shadowIdx;
    mat4 mvp;
};

layout (binding = 0) uniform light_uniform_buffer_object {
    light lights[16];
    vec4 cameraPos;
    int lightCount;
} lightUBO;

layout (binding = 1) uniform render_uniform_buffer_object {
    vec4 ambient;
    int sampleCount;
} renderUBO;

layout (location = 0) in vec2 inUV;

layout (location = 0) out vec4 outFragColor;

#define SHADOW_FACTOR 0.0
#define PI 3.14159

const mat4 biasMat = mat4(
    0.5, 0.0, 0.0, 0.0,
    0.0, 0.5, 0.0, 0.0,
    0.0, 0.0, 0.5, 0.0,
    0.5, 0.5, 0.5, 1.0);

float textureProj(vec4 P, vec2 off, int layer)
{
    float shadow = 1.0;
    vec4 shadowCoord = P;
    shadowCoord.st = shadowCoord.st * 0.5 + 0.5;
    if (shadowCoord.z > -1.0 && shadowCoord.z < 1.0 && shadowCoord.x > 0.0 && shadowCoord.x < 1.0 && shadowCoord.y > 0.0 && shadowCoord.y < 1.0)
    {
        float dist = texture(shadowDepth, vec3(shadowCoord.st + off, layer)).r;
        if (shadowCoord.w > 0.0 && dist < shadowCoord.z - 0.0015)
        {
            shadow = SHADOW_FACTOR;
        }
    }
    return shadow;
}

float filterPCF(vec4 sc, int layer)
{
    ivec2 texDim = textureSize(shadowDepth, 0).xy;
    float scale = 1.0;
    float dx = scale * 1.0 / float(texDim.x);
    float dy = scale * 1.0 / float(texDim.y);

    float shadowFactor = 0.0;
    int count = 0;
    int range = 1;
    
    for (int x = -range; x <= range; x++)
    {
        for (int y = -range; y <= range; y++)
        {
            shadowFactor += textureProj(sc, vec2(dx*x, dy*y), layer);
            count++;
        }
    }
    return shadowFactor / count;
}

vec4 resolve(sampler2DMS tex, ivec2 uv)
{
    vec4 result = vec4(0.0);
    for (int i = 0; i < renderUBO.sampleCount; i++)
    {
        vec4 val = texelFetch(tex, uv, i); 
        result += val;
    }    
    // Average resolved samples
    return result / float(renderUBO.sampleCount);
}

// Tone Mapping
vec3 Tonemap(vec3 x)
{
    float A = 0.15;
    float B = 0.50;
    float C = 0.10;
    float D = 0.20;
    float E = 0.02;
    float F = 0.30;
    return ((x*(A*x+C*B)+D*E)/(x*(A*x+B)+D*F))-E/F;
}

// Normal Distribution
float D_GGX(float dotNH, float roughness)
{
    float alpha = roughness * roughness;
    float alpha2 = alpha * alpha;
    float denom = dotNH * dotNH * (alpha2 - 1.0) + 1.0;
    return (alpha2)/(PI * denom*denom); 
}

// Geometric Shadowing
float G_SchlicksmithGGX(float dotNL, float dotNV, float roughness)
{
    float r = (roughness + 1.0);
    float k = (r*r) / 8.0;
    float GL = dotNL / (dotNL * (1.0 - k) + k);
    float GV = dotNV / (dotNV * (1.0 - k) + k);
    return GL * GV;
}

// Fresnel
float fresnel(vec3 N, vec3 V, float roughness)
{
    N = mix(N, V, roughness);
    float ior = 1.45;
    float c = max(dot(N, V), 0.0);
    float g = ior * ior - 1.0 + c * c;
    if (g > 0.0)
    {
        g = sqrt(g);
        float A = (g - c) / (g + c);
        float B = (c * (g + c) - 1.0) / (c * (g - c) + 1.0);
        return 0.5 * A * A * (1.0 + B * B);
    }
    else
    {
        return 1.0;
    }
}

// Specular
vec3 specularContribution(vec3 L, vec3 V, vec3 N, vec3 albedo, float metallic, float roughness)
{
    // Precalculate vectors and dot products    
    vec3 H = normalize (V + L);
    float dotNH = clamp(dot(N, H), 0.0, 1.0);
    float dotNV = clamp(dot(N, V), 0.0, 1.0);
    float dotNL = clamp(dot(N, L), 0.0, 1.0);

    // Light color fixed
    vec3 color = vec3(0.0);

    if (dotNL > 0.0) {
        // D = Normal distribution (Distribution of the microfacets)
        float D = D_GGX(dotNH, roughness); 
        // G = Geometric shadowing term (Microfacets shadowing)
        float G = G_SchlicksmithGGX(dotNL, dotNV, roughness);
        // F = Fresnel factor (Reflectance depending on angle of incidence)
        float F = fresnel(N, V, roughness);        
        vec3 spec = vec3(D * F * G) / (4.0 * dotNL * dotNV + 0.001);
        vec3 kD = (vec3(1.0) - F) * (1.0 - metallic);            
        color += (kD * albedo / PI + spec) * dotNL;
    }

    return color;
}

void main()
{
    ivec2 attDim = textureSize(samplerAlbedo);
    ivec2 UV = ivec2(inUV * attDim);

    vec3 albedo = resolve(samplerAlbedo, UV).rgb;
    vec3 normal = resolve(samplerNormal, UV).rgb;
    vec3 position = resolve(samplerPosition, UV).rgb;
    vec3 pbr = resolve(samplerPBR, UV).rgb;
    float depth = resolve(samplerDepth, UV).r;

    vec3 N = normalize(normal);
    vec3 V = normalize(lightUBO.cameraPos.xyz - position);

    vec3 sky = texture(samplerSkybox, -N).rgb;
    vec3 illum = texture(samplerIllumination, -N).rgb;

    vec3 L0 = vec3(0.0, 0.0, 0.0);
    vec3 F0 = vec3(0.04); 
    F0 = mix(F0, albedo, pbr.r);

    float F = fresnel(N, V, pbr.g) - (fresnel(V, V, pbr.g) * pbr.r);
    vec3 diffuse = albedo * illum * 0.5;
    vec3 specular = mix(sky, illum * ((1.0 - pbr.g) * 0.5 + 0.5), pbr.g);

    for (int i = 0; i < lightUBO.lightCount; ++i)
    {
        vec3 L;
        float attenuation = 1.0;
        if (lightUBO.lights[i].direction.w < 0.0)
        {
            L = lightUBO.lights[i].position.xyz - (position * 2.0);
            attenuation = 0.25 / (pow(length(L), 2.0));
            L = normalize(L);
        }
        else
        {
            L = normalize(lightUBO.lights[i].direction.xyz);
            if (lightUBO.lights[i].shadowIdx.x > -1)
                attenuation = filterPCF(lightUBO.lights[i].mvp * vec4(position, 1.0), i);
        }
        vec3 H = normalize (V + L);
        float dotNH = clamp(dot(N, H), 0.0, 1.0);
        float dotNV = clamp(dot(N, V), 0.0, 1.0);
        float dotNL = clamp(dot(N, L), 0.0, 1.0);
        float D = D_GGX(dotNH, pbr.g);
        float G = G_SchlicksmithGGX(dotNL, dotNV, pbr.g);
        float F = fresnel(N, V, pbr.g);
        vec3 spec = vec3(D * F * G) / (4.0 * dotNL * dotNV + 0.001);
        vec3 kD = (vec3(1.0) - F) * (1.0 - pbr.r);
        diffuse += vec3(D * F * G) * lightUBO.lights[i].color.rgb * mix(vec3(1), albedo, pbr.r) * attenuation;
        diffuse += mix(G, D * G, pbr.r) * attenuation * lightUBO.lights[i].color.rgb * albedo;
    }

    vec3 color = mix(diffuse, specular, F);
    //color += L0;
    color += albedo * pbr.b;

    //color = Tonemap(color * 4.5);
    //color = color * (1.0f / Tonemap(vec3(11.2f)));
    //color = pow(color, vec3(1.0f / 2.2f));
    outFragColor = vec4(color, 1.0f);

    if (depth == 1.0)
        outFragColor = texture(samplerSky, inUV).rgba;
}

