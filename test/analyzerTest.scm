; module.exports = `
(define globalVar "Test")
(let ((localVar "AAAA"))
  ; declare: localVar
  ; get:
  ; set:
  ; inherit-get: globalVar
  ; inherit-set: localVar
  ; children: lambda, lambda
  ((lambda (p)
    ; declare: p
    ; get: p
    ; set: localVar
    (set! localVar "222")
    (display p)
  ) "15")
  (newline)
  (io-exec "test" '() (lambda (x)
    ; declare: x
    ; get: x, globalVar
    ; set: x
    (if (> x 3) (set! x 53) (display globalVar))
  ))
)
(let ((localVar "BBBB") (a 1))
  ; declare: localVar, a
  ; scope: localVar, a
  ; get:
  ; set:
  ; inherit-get:
  ; inherit-set: globalVar
  ; final-get:
  ; final-set: globalVar
  ; local-get
  ; local-set
  ; global-get
  ; global-set
  (io-exec "test" '() (lambda (b)
    ; declare: b
    ; scope: localVar, a, b
    ; get:
    ; set: b
    ; inherit-get: b
    ; inherit-set: b, globalVar
    ; final-get: b
    ; final-set: b, globalVar
    (set! b 2)
    (io-exec "test2" '() (lambda (c)
      ; declare: c
      ; scope: localVar, a, b, c
      ; get: b, c
      ; set:
      ; inherit-get:
      ; inherit-set: b, globalVar
      ; final-get: b, c
      ; final-set: b, globalVar
      (display (+ b c))
      (io-exec "test3" '() (lambda (d)
        ; declare: d
        ; scope: localVar, a, b, c, d
        ; get: d
        ; set: b
        ; inherit-get:
        ; inherit-set: globalVar
        ; final-get: d
        ; final-set: b, globalVar
        (set! b 1)
        (display d)
        (io-exec "test4" '() (lambda ()
          ; declare:
          ; scope: localVar, a, b, c, d
          ; get:
          ; set: globalVar
          (set! globalVar "Nope")
        ))
      ))
    ))
  ))
)
;`;
