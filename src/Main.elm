port module Main exposing (main)

import Browser
import Html exposing (Html)
import Html.Attributes exposing (id, src)
import Html.Events exposing (onClick)
import Http
import Json.Decode as Decode
import Json.Encode as Json


catApiUrl =
    "https://api.thecatapi.com/v1/images/search?"


type Msg
    = GotCat (Result Http.Error Cat)
    | MoreCat
    | CatReady (Maybe String)


type alias CatId =
    String


type alias Url =
    String


type alias Model =
    { isLive : Bool
    , cat : Cat
    }


type Cat
    = Loading
    | Cat (String -> String) CatId Url
    | NoCat


port hydrated : (Maybe String -> msg) -> Sub msg


main : Platform.Program {} Model Msg
main =
    Browser.element
        { init = \_ -> ( { isLive = False, cat = Loading }, getCat )
        , update = update
        , view = view
        , subscriptions = subscriptions
        }


subscriptions model =
    if not model.isLive then
        hydrated CatReady

    else
        Sub.none


update msg model =
    case msg of
        GotCat (Ok cat) ->
            ( { model | cat = cat }, Cmd.none )

        GotCat (Err err) ->
            ( { model | cat = NoCat }, Cmd.none )

        MoreCat ->
            ( model, getCat )

        CatReady err ->
            ( { model | isLive = True }, Cmd.none )


getCat : Cmd Msg
getCat =
    Http.get catApiUrl firstCatDecoder
        |> Http.send GotCat


firstCatDecoder : Decode.Decoder Cat
firstCatDecoder =
    Decode.list catDecoder
        |> Decode.andThen
            (List.head
                >> Maybe.map Decode.succeed
                >> Maybe.withDefault (Decode.fail "No cats :-C")
            )


catDecoder : Decode.Decoder Cat
catDecoder =
    Decode.map2 (Cat showCatId)
        (Decode.field "id" Decode.string)
        (Decode.field "url" Decode.string)


showCatId : String -> String
showCatId catId =
    getId 1 ++ ": " ++ catId


getId x =
    if x == 0 then
        "ID"

    else
        "I" ++ getId (x - 1)


view : Model -> Html Msg
view model =
    Html.div [ Html.Attributes.attribute "id" "app" ]
        [ Html.button [ onClick MoreCat, ariaDisabled (not model.isLive) ] [ Html.text "More cat!" ]
        , case model.cat of
            Loading ->
                Html.text "Loading..."

            NoCat ->
                Html.text "Can't find any cats"

            Cat f catId url ->
                showCat f catId url
        , styles
        ]


showCat f catId url =
    Html.figure []
        [ Html.img [ Html.Attributes.attribute "src" url ] []
        , Html.figcaption [] [ Html.text (f catId) ]
        ]


ariaDisabled : Bool -> Html.Attribute msg
ariaDisabled bool =
    Html.Attributes.attribute "aria-disabled"
        (if bool then
            "true"

         else
            "false"
        )


styles =
    Html.node "style" [] [ Html.text rawStyle ]


rawStyle =
    String.join "\n"
        [ "[aria-disabled=\"true\"] { opacity: 0.5; }"
        , "button { transition: opacity 0.5s; }"
        ]
