#version 450
#extension GL_ARB_separate_shader_objects : enable

layout(binding = 1) uniform sampler2D texSampler;

layout(location = 0) in vec3 fragNormal;
layout(location = 1) in vec2 fragTexCoord;

layout(location = 0) out vec4 outColor;

void main() {
    outColor = texture(texSampler, fragTexCoord);
    outColor = vec4(fragNormal, 1.0f);
    float shade = max(dot(fragNormal, vec3(0, 2, 0)), 0.0);
    outColor = texture(texSampler, fragTexCoord) * vec4(shade, shade, shade, 1.0f);
}
