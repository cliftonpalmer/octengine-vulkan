#include "application.h"

#include <iostream>


int main() {
    application_t app;
    app.enableValidationLayers = true;
    app.windowWidth = 800;
    app.windowHeight = 600;

    try {
        application_run(&app);
    } catch (const std::runtime_error& e) {
        std::cerr << e.what() << std::endl;
        return EXIT_FAILURE;
    }

    return EXIT_SUCCESS;
}
