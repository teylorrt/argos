plugins { id("com.android.application") }

android {
    buildFeatures { buildConfig = true }
    namespace = "dev.teylor.argos"
    compileSdk = 37
    defaultConfig {
        applicationId = "dev.teylor.argos"
        minSdk = 26
        targetSdk = 37
        versionCode = 2
        versionName = "0.2.0"
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    testOptions { unitTests.isIncludeAndroidResources = true }
    val signingPath = providers.environmentVariable("ARGOS_KEYSTORE").orNull
    if (signingPath != null) {
        signingConfigs {
            create("personalRelease") {
                storeFile = file(signingPath)
                storePassword = providers.environmentVariable("ARGOS_STORE_PASSWORD").get()
                keyAlias = "argos"
                keyPassword = providers.environmentVariable("ARGOS_STORE_PASSWORD").get()
            }
        }
        buildTypes { getByName("release") { signingConfig = signingConfigs.getByName("personalRelease") } }
    }
}

dependencies {
    implementation("androidx.work:work-runtime-ktx:2.11.0")
    implementation("androidx.room:room-runtime:2.8.4")
    annotationProcessor("androidx.room:room-compiler:2.8.4")
    implementation("com.nimbusds:nimbus-jose-jwt:10.6")
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.robolectric:robolectric:4.16.1")
    testImplementation("androidx.test:core:1.7.0")
}
