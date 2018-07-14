#include "script.h"
#include "model.h"

using namespace std;


void script_error(script_t *script, string message)
{
    cerr << message << ": " << lua_tostring(script->lua, -1) << endl;
    exit(1);
}

void script_create(script_t *script, string path)
{
    script->lua = luaL_newstate();
    luaL_openlibs(script->lua);
    
    if (luaL_loadfile(script->lua, path.c_str()))
        script_error(script, "luaL_loadfile failed");

    if (lua_pcall(script->lua, 0, 0, 0))
        script_error(script, "loading script failed");

    script->name = path;
}

void script_setup(script_t *script, void *scene, void *object)
{
    lua_getglobal(script->lua, "setup");
    lua_pushinteger(script->lua, (long long int)scene);
    lua_pushinteger(script->lua, (long long int)object);
    if (lua_pcall(script->lua, 2, 1, 0))
        script_error(script, "setup failed");
}

void script_update(script_t *script, void *scene, void *object, float delta)
{
    lua_getglobal(script->lua, "update");
    lua_pushinteger(script->lua, (long long int)scene);
    lua_pushinteger(script->lua, (long long int)object);
    lua_pushnumber(script->lua, delta);
    if (lua_pcall(script->lua, 3, 1, 0))
        script_error(script, "update failed");
}

void script_on_cursor_pos(script_t *script, void *scene, void *object, double x, double y)
{
    lua_getglobal(script->lua, "on_cursor_pos");
    if (lua_isnil(script->lua, -1))
        return;

    lua_pushinteger(script->lua, (long long int)scene);
    lua_pushinteger(script->lua, (long long int)object);
    lua_pushnumber(script->lua, x);
    lua_pushnumber(script->lua, y);
    if (lua_pcall(script->lua, 4, 1, 0))
        script_error(script, "on cursor pos failed");
}

void script_destroy(script_t *script)
{
    lua_close(script->lua);
}

