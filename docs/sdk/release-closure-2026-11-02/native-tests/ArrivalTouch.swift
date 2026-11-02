import XCTest
final class ArrivalTouch: XCTestCase {
  func testAX5ArrivalActionsByCoordinates() throws {
    let app = XCUIApplication(bundleIdentifier: "com.example.sdkconsumer")
    app.activate()
    XCTAssertTrue(app.buttons["nav-arrived-done-button"].waitForExistence(timeout: 8), "Precondition: native Arrival must already be active at AX5")
    let recenter = app.buttons["nav-arrived-recenter-button"]
    let done = app.buttons["nav-arrived-done-button"]
    for _ in 0..<10 {
      if recenter.isHittable && done.isHittable { break }
      app.swipeUp(velocity: .slow)
    }
    let shot = XCTAttachment(screenshot: app.screenshot());shot.name = "AX5-visible-actions";shot.lifetime = .keepAlways;add(shot)
    XCTAssertTrue(recenter.isHittable, "Recenter must be visible and touch reachable")
    XCTAssertTrue(done.isHittable, "Done must be visible and touch reachable")
    let origin = app.coordinate(withNormalizedOffset: .zero)
    let r = recenter.frame
    origin.withOffset(CGVector(dx: r.midX, dy: r.midY)).tap()
    XCTAssertTrue(done.exists, "Recenter must retain Arrival")
    let d = done.frame
    origin.withOffset(CGVector(dx: d.midX, dy: d.midY)).tap()
    XCTAssertTrue(app.staticTexts["Where to?"].waitForExistence(timeout: 5), "Touch Done must exit journey")
    let exit = XCTAttachment(screenshot: app.screenshot());exit.name = "AX5-touch-Done-exited";exit.lifetime = .keepAlways;add(exit)
  }
}
