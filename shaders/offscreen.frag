#version 450
#extension GL_ARB_separate_shader_objects : enable

layout(binding = 2) uniform sampler2DArray texSampler;

layout (location = 0) in vec3 inNormal;
layout (location = 1) in vec2 inUV;
layout (location = 2) in vec3 inColor;
layout (location = 3) in vec3 inWorldPos;
layout (location = 4) flat in ivec3 inTexIdx;

layout (location = 0) out vec4 outAlbedo;
layout (location = 1) out vec4 outNormal;
layout (location = 2) out vec4 outPosition;
layout (location = 3) out vec4 outPBR;

void main() {
    vec3 normal = (texture(texSampler, vec3(inUV, inTexIdx.g)).rgb * 2 - 1);

    vec3 tangent = normalize(normal - inNormal * dot(normal, inNormal));
    vec3 bitangent = cross(tangent, inNormal);
    mat3 TBN = mat3(tangent, bitangent, inNormal);

    outNormal = vec4(TBN * normal, 1.0);
    outPosition = vec4(inWorldPos, 1.0);
    outAlbedo = texture(texSampler, vec3(inUV, inTexIdx.r));
    outPBR = vec4(texture(texSampler, vec3(inUV, inTexIdx.b)).rgb, outAlbedo.a);
}
